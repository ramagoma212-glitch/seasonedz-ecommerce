# Version 5 — PayFast Verification Strategy Update (Milestone 35)

Updates the PayFast notify-verification strategy so production
readiness rests on checks that can actually be proven, while DNS-based
source IP matching becomes best-effort only — never a hard blocker —
until its acceptance path can be proven directly on Render.

## Background

`VERSION_5_PAYFAST_PRODUCTION_READINESS_INVESTIGATION.md` (Milestone
33) found that DNS-based source IP matching is inherently unreliable to
prove through any proxy/tunnel topology tested so far, and recommended
using signature verification, merchant ID verification, amount
verification, PayFast server validation, and idempotency as the real
production gate — with source IP verification demoted to best-effort,
not a blocker, unless it can be proven reliable on the actual hosting
environment (Render) specifically.

## `PAYFAST_SOURCE_VERIFICATION_MODE`

New optional environment variable: `off | monitor | enforce`.

| Mode | Behaviour |
|---|---|
| `off` | The DNS source check does not run at all. |
| `monitor` | The check runs; the pass/fail outcome is logged safely; a failure **never blocks** the notification — every other check (signature, merchant ID, amount, server validation, idempotency) still fully applies. |
| `enforce` | The check runs and a failure **blocks** the notification with a clean `403` — identical to the old `PAYFAST_VERIFY_SOURCE=true`. |

Implemented in `backend/src/config/env.ts` (parsing/validation) and
`backend/src/services/payfast.service.ts` (the actual branch at Step 5
of the notify flow).

## Relationship to `PAYFAST_VERIFY_SOURCE`

The old boolean is **not removed** — it's still read, as a backward-
compatible fallback, only consulted when `PAYFAST_SOURCE_VERIFICATION_MODE`
isn't set at all:

- `PAYFAST_VERIFY_SOURCE=true` → `"enforce"` (preserves the exact prior
  hard-blocking behaviour for any environment that had already opted
  in).
- `PAYFAST_VERIFY_SOURCE=false` or unset → `"off"` (preserves the exact
  prior no-op behaviour — an environment that never asked for source
  checking never silently starts a new DNS lookup on every notify
  call).

**Why `false` maps to `"off"`, not `"monitor"`:** this was an explicit
choice. Mapping to `"monitor"` would have meant every existing
environment — local dev, and the current Render deployment, both of
which have `PAYFAST_VERIFY_SOURCE=false`/unset today — would silently
start performing a new DNS lookup and a new log line on every notify
call, the moment this code deploys, with nobody having asked for it.
That's a real (if minor) behaviour change for zero benefit to anyone
who hasn't opted in. `"monitor"` is opt-in only, via explicitly setting
`PAYFAST_SOURCE_VERIFICATION_MODE=monitor` — the safest possible
migration is one where nothing changes for anyone until they
deliberately ask for it.

An explicit `PAYFAST_SOURCE_VERIFICATION_MODE` value always wins over
the legacy boolean, and an invalid value (anything other than `off`,
`monitor`, or `enforce`) fails backend startup with a clear error
naming the problem — the same pattern already used for `PAYFAST_MODE`.

## `PAYFAST_VALIDATE_SERVER` as a Production Requirement

**For production PayFast readiness, `PAYFAST_VALIDATE_SERVER=true` is
now a required precondition** — not merely recommended. This is a
documentation/operational requirement, not something the code enforces
(the backend has no way to know "we're about to go live" versus "we're
testing sandbox"), and `PAYFAST_VALIDATE_SERVER` remains fully optional
for local startup — it still defaults to `false`, and local development
is never broken by this requirement. Milestone 30 already proved this
check's acceptance path works against real PayFast infrastructure (a
real ITN, correctly validated as `"VALID"`) — it's the one verification
layer whose acceptance path is already proven, which is exactly why it
becomes the hard requirement here.

## What Checks Are Hard Blockers

Always required, regardless of any mode or flag — unaffected by this
milestone:

- Basic ITN field presence.
- Merchant ID match.
- Signature verification.
- Order lookup (the referenced order must exist).
- Amount verification (must match the order total exactly).
- Order eligibility (payment method, order status, payment status).
- Idempotency (a duplicate `COMPLETE` is acknowledged, never
  re-processed).

Additionally hard-blocking, but only when configured on:

- `PAYFAST_VALIDATE_SERVER=true` — a non-`"VALID"` response, non-2xx
  status, network error, or timeout all block with a clean `400`.
- `PAYFAST_SOURCE_VERIFICATION_MODE=enforce` — a source that doesn't
  resolve back to one of PayFast's own domains blocks with a clean
  `403`.

**Never** marks an order `PAID` if signature, merchant ID, amount, or
(when enabled) server validation fails — this was already true and
remains completely unchanged by this milestone.

## What "Monitor" Mode Means

`PAYFAST_SOURCE_VERIFICATION_MODE=monitor` runs the exact same DNS
source check as `enforce`, and logs the exact same pass/fail outcome —
the only difference is that a failure is never treated as a reason to
reject the notification. Every other check still fully applies: a
notification that fails source verification in `monitor` mode is only
ever accepted if it also passes signature, merchant ID, amount,
eligibility, and (if enabled) server validation.

## Why Monitor Mode Is Safer Before Enforcement

`enforce` mode on unproven infrastructure risks rejecting genuine
PayFast payments for reasons that have nothing to do with whether the
notification really came from PayFast — exactly what happened during
Milestone 30's real hosted round trip through ngrok, where a genuine
PayFast ITN was correctly-but-unhelpfully rejected, for a reason that
was never conclusively isolated (tunnel IP-forwarding behaviour vs. a
genuine DNS/IP mismatch). `monitor` mode lets this same check run and
log its real-world pass/fail rate on the actual hosting environment
(Render) — including against genuine PayFast traffic once
`PAYFAST_ENABLED` is ever considered — **without** risking a single
real customer payment being wrongly rejected while that evidence is
gathered. Only once `monitor` mode's logs show it consistently passing
against real PayFast traffic on Render specifically does `enforce`
become a reasonable, evidence-based step.

## Safe Logging

A single new log line, `logPayfastVerificationEvent()` in
`payfast.service.ts`, fires whenever source verification or server
validation actually runs:

```
[PayFast] order=SG-2026-A1B2 check=sourceVerification mode=monitor result=fail reason=no_dns_match
```

**Logged:** order number, which check ran, its configured mode, a
plain pass/fail result, and a coarse reason category
(`matched`/`no_source_ip`/`no_dns_match` for source verification;
`matched`/`not_valid` for server validation).

**Never logged, by construction (not just convention) — none of these
values are ever passed into the logging function:** the raw PayFast
payload, the passphrase, the merchant key, the signature string, the
customer's full address, or the customer's full phone number. The
reason category is deliberately coarse enough that it can never leak
anything sensitive (never a real IP address, never a DNS-resolved
address, never any request header).

## What Is Still Required Before Production Enablement

Unchanged from Milestone 33/34's findings, now narrowed to one item:

1. **Prove (or formally accept as a documented trade-off) the
   verification acceptance path directly on Render** — a real PayFast
   sandbox round trip against the actual deployed Render backend (not
   local development, not a tunnel), using `PAYFAST_VALIDATE_SERVER=true`
   as the gate and `PAYFAST_SOURCE_VERIFICATION_MODE=monitor` to observe
   (without risk) how the DNS source check behaves on Render's real
   proxy topology. **The plan and checklist for this are now complete —
   see `VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md` (Milestone 36) —
   but the round trip itself has not been run yet**, and requires the
   user to manually apply Render's sandbox environment checklist first.
2. Retry-while-`PENDING` is already resolved (Milestone 34).

Only after (1) is resolved should `PAYFAST_ENABLED` /
`VITE_PAYFAST_ENABLED` ever be set `true` in Render production, and
only with `PAYFAST_VALIDATE_SERVER=true` — per this milestone,
`PAYFAST_SOURCE_VERIFICATION_MODE=enforce` should not be turned on
until `monitor` mode's own logs on Render have shown it reliably
passing against real PayFast traffic.

## Testing

All testing was local-only, using crafted ITN payloads (a real,
correctly-computed signature — using the real sandbox merchant
credentials already in `backend/.env` — over synthetic field values)
POSTed directly to the local backend's notify endpoint. No hosted
PayFast payment was run; the one real network call made
(`PAYFAST_VALIDATE_SERVER=true` against PayFast's real sandbox
`/eng/query/validate` endpoint) is a validation query, not a payment,
and is the same already-established, already-approved technique used in
Milestone 29.

| Test | Mode(s) | Result |
|---|---|---|
| Valid crafted `COMPLETE`, default mode (`off`/server validation off) | — | ✅ Marked `PAID` |
| Duplicate `COMPLETE` (same payload again) | — | ✅ Idempotent acknowledgement, no re-processing |
| Invalid signature | default, `enforce` | ✅ Blocked (`403`) in both |
| Wrong amount | default, `enforce` | ✅ Blocked (`400`) in both |
| Wrong merchant ID | default, `enforce` | ✅ Blocked (`400`) in both |
| `PAYFAST_VALIDATE_SERVER=true`, crafted (non-genuine) data | — | ✅ Blocked (`400`) — PayFast's real validate endpoint correctly said not-`"VALID"` |
| `PAYFAST_SOURCE_VERIFICATION_MODE=enforce`, otherwise-valid local request | — | ✅ Blocked (`403`) — local source IP doesn't resolve from PayFast's domains |
| `PAYFAST_SOURCE_VERIFICATION_MODE=monitor`, otherwise-valid local request | — | ✅ **Not blocked** — marked `PAID`, source-check failure only logged |
| `FAILED` status | — | ✅ Marked `FAILED`, `order.status` unchanged |
| `CANCELLED` status | — | ✅ Marked `CANCELLED`, `order.status` unchanged |
| Legacy `PAYFAST_VERIFY_SOURCE=true` (no new variable set) | — | ✅ Behaves exactly like `enforce` — blocked (`403`), log line shows `mode=enforce` |
| Stock before vs. after all notify tests | — | ✅ Unchanged (46 → 46) — notify never touches stock |

Seven controlled test orders (`SG-2026-M6A1` through `M6E1`) were
created directly via Prisma for this testing and deleted afterward;
none were created through the real checkout flow, so none affected
stock. `SG-2026-28SM` was confirmed untouched throughout.

## Milestone 36 Planning

This milestone's local, crafted-request testing proves the strategy's
logic is correct — it does not, and cannot, prove how
`PAYFAST_SOURCE_VERIFICATION_MODE` behaves against genuine PayFast
traffic on Render's real proxy topology, since a local request is
never PayFast's real infrastructure. `VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md`
(Milestone 36) is the exact plan and checklist for the real hosted
round trip against the deployed Render backend that would finally
prove (or disprove) that — including a manual Render environment
checklist (sandbox credentials only), a recommended local-frontend-
against-Render testing approach that keeps the live GitHub Pages
frontend's `VITE_PAYFAST_ENABLED=false` untouched throughout, and a
rollback checklist. That round trip has not been run yet.
