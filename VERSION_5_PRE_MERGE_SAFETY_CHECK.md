# Version 5 — Pre-Merge Production Safety Check

A production environment safety review completed before merging
`version-5-payfast-readiness` into `main`. Review only — no merge, no
deploy, no code change (beyond this document) was made.

## What Was Checked

- Git state: `main` untouched, `version-5-payfast-readiness` pushed and
  tracking correctly.
- `.github/workflows/deploy.yml` — the production frontend build's
  environment variables.
- Every tracked `.env.example`-style file, for safe default values and
  the absence of any real secret.
- Whether merging could activate any real payment, email, or courier
  behaviour given production's actual (unchanged) environment
  configuration.

No secret value is printed anywhere in this document or was requested
from the user.

## Git State

| Check | Result |
|---|---|
| `main` latest commit | `5810bee8453510eeb0162dd9624c9555f1f21d6b` — matches expected, both locally and on `origin/main` |
| `version-5-payfast-readiness` latest commit | `be14ec3affd63bdc47f60cfdd81d852bbd451581` — matches expected, both locally and on `origin/version-5-payfast-readiness` |
| Branch tracking | Local `version-5-payfast-readiness` correctly tracks `origin/version-5-payfast-readiness` |

## GitHub Actions Frontend Flag Status

`.github/workflows/deploy.yml`'s build step explicitly sets, in its
`env:` block:

```
VITE_API_BASE_URL: https://seasonedz-ecommerce.onrender.com/api
VITE_PAYFAST_ENABLED: "false"
```

Both confirmed present and correct. `VITE_PAYFAST_ENABLED: "false"` is
set explicitly (not just relying on the frontend code's own default),
exactly as it has been since Version 3's own pre-merge hardening —
unchanged by anything in Version 5.

## Env Example Safety Status

| Variable | Tracked value | File |
|---|---|---|
| `VITE_PAYFAST_ENABLED` | `false` | `.env.example` |
| `PAYFAST_ENABLED` | `false` | `backend/.env.example` |
| `PAYFAST_VALIDATE_SERVER` | `false` | `backend/.env.example` |
| `PAYFAST_SOURCE_VERIFICATION_MODE` | `off` | `backend/.env.example` |
| `PAYFAST_VERIFY_SOURCE` (legacy, still present) | `false` | `backend/.env.example` |
| `TRUST_PROXY` | `false` | `backend/.env.example` |
| `EMAIL_ENABLED` | `false` | `backend/.env.example` |

**No secrets present** — `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`,
`PAYFAST_PASSPHRASE`, `DATABASE_URL`, and `DIRECT_URL` are all empty in
`backend/.env.example`. `.env.production.example` documents only the
non-secret `VITE_API_BASE_URL` for reference and doesn't set
`VITE_PAYFAST_ENABLED` at all — this is unchanged from prior versions
and not a gap, since the frontend code itself already defaults that
flag to `false` when unset.

**No real `.env` file is tracked anywhere** — only the three
`.env.example`-style files above.

## Render Manual Checklist

**For the user to verify directly in the Render dashboard before
merging — no values need to be pasted anywhere, only confirmed.**

- [ ] `PAYFAST_ENABLED` is `false` or not set
- [ ] `PAYFAST_VALIDATE_SERVER` is `false` or not set
- [ ] `PAYFAST_SOURCE_VERIFICATION_MODE` is `off` or not set
- [ ] `PAYFAST_VERIFY_SOURCE` is `false` or not set
- [ ] `TRUST_PROXY` is `false` or not set
- [ ] `EMAIL_ENABLED` is `false` or not set
- [ ] PayFast credential variables (`PAYFAST_MERCHANT_ID`,
      `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`) are not present
- [ ] `DATABASE_URL` and `DIRECT_URL` are present
- [ ] `FRONTEND_PRODUCTION_URL` is correct (the live GitHub Pages
      origin)
- [ ] The Render service's connected branch is `main`

## Would Merging Activate Any Real Payment, Email, or Courier Behaviour?

**No, if production env flags remain false or unset** (per the Render
manual checklist above). Every capability Version 5 adds or changes —
the `context: "checkout" | "retry"` split on
`POST /api/payments/payfast/initiate`, the new
`PAYFAST_SOURCE_VERIFICATION_MODE`, the safe verification-outcome
logging — sits entirely behind the same `PAYFAST_ENABLED` gate that
already exists and already defaults to `false`. None of it changes
what happens when `PAYFAST_ENABLED` is `false`, which is production's
actual current state. No email-sending code was touched. No courier
integration exists to activate.

## Known Blockers for Enabling PayFast

- **The Render sandbox payment test has not been run yet** — Milestone
  36 (`VERSION_5_RENDER_PAYFAST_SANDBOX_QA_PLAN.md`) produced the exact
  plan and checklist, but the actual round trip against the deployed
  Render backend has not been carried out. This remains the primary
  blocker before `PAYFAST_ENABLED` could ever be considered for
  production.
- A payment-attempt model for genuine duplicate-payment *detection*
  remains unbuilt future work (unchanged from Milestone 37's QA
  review).

## Is Merge Safe?

**Yes.** The branch is internally consistent, fully tested locally
(`VERSION_5_QA_MERGE_READINESS_REVIEW.md`), and every new capability is
backward-compatible — nothing changes for an environment that doesn't
explicitly opt into the new flags.

## Is Deployment Safe?

**Yes, provided the Render manual checklist above is confirmed true
first.** Deploying this branch's code to Render, with Render's
environment left exactly as it already is, would not change any live
behaviour — every new code path stays behind flags already defaulting
to their current safe values.

## Is Production PayFast Safe to Enable?

**No.** The Render sandbox round trip has not been run — see "Known
Blockers" above. This is unrelated to whether the merge/deploy itself
is safe; it's a separate, later, deliberate decision.
