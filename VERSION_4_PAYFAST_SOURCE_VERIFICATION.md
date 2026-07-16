# Version 4 — PayFast Source Verification Hardening (Milestone 29)

Adds two further, independent checks to the PayFast ITN notify flow —
source IP verification and PayFast server confirmation — both
disabled by default, both layered **on top of**, never instead of,
the signature/amount/merchant-ID verification and idempotency that
already existed from Milestone 22. No PayFast credential changed, no
Render environment changed, no hosted sandbox payment was run.

## `PAYFAST_VERIFY_SOURCE`

Default: `false`. When `true`, `POST /api/payments/payfast/notify`
additionally requires the request's source IP to resolve back to one
of PayFast's own domains (see "Valid PayFast Domains" below) before
trusting the notification. Implemented in
`backend/src/utils/payfastSourceVerification.ts`, wired into
`backend/src/services/payfast.service.ts` as Step 5 of the notify
flow. Failure → clean `403` (`"PayFast source verification failed."`)
— the same class of failure as an invalid signature (identity/
authenticity), never a `400`.

## `PAYFAST_VALIDATE_SERVER`

Default: `false`. When `true`, the notify handler additionally POSTs
the exact ITN data it received back to PayFast's own validation
endpoint and requires a `"VALID"` response before trusting the
notification — PayFast's own recommended custom-integration
confirmation step. Implemented in
`backend/src/utils/payfastServerValidation.ts`, wired in as Step 6.
Failure (a non-`"VALID"` response, a non-2xx status, a network error,
or an 8-second timeout) → clean `400` (`"PayFast server validation
failed."`) — deliberately distinct from the `403`s above: PayFast's
infrastructure was reachable and responded, this is "the data didn't
check out," the same class of failure as an amount/merchant-ID
mismatch.

## `TRUST_PROXY`

Default: `false`. When `true` (or `1`), `backend/src/app.ts` calls
`app.set("trust proxy", 1)` — trusting exactly one reverse-proxy hop,
never every hop in a chain (`true` would let a client freely spoof
`X-Forwarded-For` if more than one proxy were ever involved). Without
this, Express's `req.ip` on Render (or behind a tunnel) always reports
the proxy's own address, never the real original caller — making
`PAYFAST_VERIFY_SOURCE` structurally unable to see PayFast's real
source IP no matter how correct its own logic is. This must be
verified against the actual proxy topology in use (Render's
documented single hop, or whatever a given tunnel adds) before being
relied on, not assumed.

## Valid PayFast Domains

No fixed IP list is hardcoded anywhere in this codebase — PayFast does
not publish a small, stable IP range to compare against directly (or
at least, none is known/verified as part of this work; asserting a
specific range without a citable source would be guessing).
`payfastSourceVerification.ts` instead resolves these domains via DNS
**at verification time** and compares the request's source IP against
whatever they currently resolve to:

| Mode | Allowed domain(s) |
|---|---|
| `sandbox` | `sandbox.payfast.co.za` |
| `production` | `www.payfast.co.za`, `w1w.payfast.co.za`, `w2w.payfast.co.za` |

Sandbox mode only allows the sandbox domain; production mode only
allows the three production domains — the two sets are distinct, never
merged, so a sandbox-configured backend can't be satisfied by a
production PayFast IP or vice versa.

## Server Validation Endpoint Behaviour

| Mode | Endpoint |
|---|---|
| `sandbox` | `https://sandbox.payfast.co.za/eng/query/validate` |
| `production` | `https://www.payfast.co.za/eng/query/validate` |

The exact ITN fields received are POSTed back as
`application/x-www-form-urlencoded` (never including anything from
this backend's own configuration — `merchant_key`/`passphrase` are
never part of an ITN body to begin with, so there's nothing sensitive
to accidentally forward). Only an exact `"VALID"` text response is
accepted; anything else — `"INVALID"`, an unexpected body, a non-2xx
status, a network error, or exceeding the 8-second timeout — is
treated identically as "not validated." **Neither the raw ITN payload
nor the validation response body is ever logged.**

## How Local Testing Differs From Real Hosted Sandbox Testing

Everything tested for this milestone used **crafted, locally-generated
requests** — a real signature (computed with the real sandbox
merchant credentials already in `backend/.env`), but data this backend
itself generated, POSTed from `curl` running on the same machine as
the backend. This proves:

- `PAYFAST_VERIFY_SOURCE=true` correctly **rejects** a local request
  (its source IP is `127.0.0.1`/`::1`, which naturally doesn't resolve
  from any PayFast domain) — confirming the rejection path works, not
  that the *acceptance* path has ever been proven against a real
  PayFast source IP.
- `PAYFAST_VALIDATE_SERVER=true` correctly **rejects** crafted data
  when POSTed to PayFast's real sandbox validate endpoint (this is a
  genuine network call to PayFast's actual infrastructure — PayFast
  responds that it doesn't recognise data it never actually generated)
  — confirming the network call, response parsing, and rejection path
  all work correctly, without needing a real payment to have happened.

**Neither test proves the *acceptance* path** — that a genuine PayFast
ITN, from PayFast's real infrastructure, for a real sandbox payment,
is correctly accepted. That can only be proven by Milestone 30's
actual hosted sandbox round trip (see `VERSION_4_PAYFAST_SANDBOX_PLAN.md`
/ `VERSION_4_PAYFAST_SANDBOX_SETUP.md`), which is the only way a real
request can ever originate from PayFast's own servers.

## Why Source Verification May Fail on Localhost Without a Real PayFast Request

`PAYFAST_VERIFY_SOURCE` checks that the caller's IP resolves back to a
PayFast domain. A request from `curl` on the same machine as the
backend, or even from a tunnel during manual testing by the developer
themselves, is not PayFast's infrastructure — its source IP will never
match, and the check will correctly reject it. **This is expected,
correct behaviour, not a bug to work around** — the whole point of the
check is that only PayFast's real servers should ever pass it. The
only way to see it correctly *accept* a request is for that request to
genuinely originate from PayFast — i.e., a real ITN during Milestone
30's hosted round trip.

## Why These Checks Must Be Enabled Before Real Live Payments

Signature verification alone proves the notification wasn't tampered
with in transit, provided the passphrase (if used) stays secret — but
it doesn't independently confirm the notification's *origin*. Source
verification and server validation each add an independent line of
defence against a forged or replayed notification from somewhere other
than PayFast's real infrastructure. Before any real production PayFast
payment is accepted, both `PAYFAST_VERIFY_SOURCE=true` and
`PAYFAST_VALIDATE_SERVER=true` should be set — this is a deliberate
operational/documentation requirement, not something this code
enforces automatically (there's no way for the backend to know "we're
about to go live" versus "we're testing sandbox").

## What Remains for Milestone 30

- Perform the actual hosted PayFast sandbox round trip (per
  `VERSION_4_PAYFAST_SANDBOX_SETUP.md`) with both `PAYFAST_VERIFY_SOURCE`
  and `PAYFAST_VALIDATE_SERVER` set to `true` locally, to finally prove
  the *acceptance* path against a genuine PayFast-originated ITN — not
  just the rejection paths this milestone proved.
- Confirm `TRUST_PROXY` is configured correctly for whatever tunnel is
  used, so `req.ip` genuinely reflects PayFast's real source IP during
  that test.
- Only after a successful real round trip with both checks enabled and
  proven: consider updating `backend/PAYFAST_SETUP.md`'s production
  readiness guidance, and — as its own separate, deliberate decision —
  whether to ever set `PAYFAST_ENABLED=true` on Render.

## Milestone 30 Result

Full detail in `VERSION_4_PAYFAST_SANDBOX_ROUND_TRIP_TEST.md`. In
short:

- **`PAYFAST_VALIDATE_SERVER`'s acceptance path is now proven** — a
  real ITN, via a real hosted round trip through ngrok, correctly
  passed server validation (a live call to PayFast's sandbox validate
  endpoint returning `"VALID"`) and the order was genuinely marked
  `PAID`.
- **`PAYFAST_VERIFY_SOURCE`'s acceptance path is still not proven** —
  the same real ITN was correctly and safely rejected (`403`) with
  `PAYFAST_VERIFY_SOURCE=true`, through ngrok with `TRUST_PROXY=true`.
  This is the one item from the list above still open. The exact cause
  wasn't conclusively isolated — either ngrok's forwarding doesn't
  present PayFast's real caller IP the way this single-hop
  `TRUST_PROXY` setting expects, or PayFast's real outbound ITN IP
  doesn't match what its published hostnames resolve to via DNS at
  verification time. Both remain equally plausible.
- A real, unrelated pair of bugs in the signature algorithm itself
  (`backend/src/utils/payfastSignature.ts` — a PHP `urlencode()`
  encoding gap, and empty-valued ITN fields being incorrectly dropped)
  was found and fixed as a prerequisite to reaching either check at
  all; see the round trip test doc for full detail.
- `PAYFAST_ENABLED` remains `false` on Render — unchanged by this
  milestone, and shouldn't change until source verification's
  acceptance path is either proven or a deliberate decision is made to
  launch without it.
