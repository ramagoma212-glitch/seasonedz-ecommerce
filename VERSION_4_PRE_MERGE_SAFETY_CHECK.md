# Version 4 — Pre-Merge Production Environment Safety Check

A production environment safety review of `version-4-payfast-hardening`
before merging into `main`. **This review changed no code** — it
audited what already exists and documents what to verify. No merge, no
deploy, no push happened as part of this review.

## What Was Checked

- `main` is untouched at `d4bb4eb` (confirmed, local and remote).
- `version-4-payfast-hardening` is pushed and tracking
  `origin/version-4-payfast-hardening` at `913d21b` (confirmed, local
  and remote hashes match).
- `.github/workflows/deploy.yml` — the production frontend build step.
- All three tracked env example files (root `.env.example`,
  `.env.production.example`, `backend/.env.example`).
- Code-level default behaviour of `PAYFAST_ENABLED`,
  `PAYFAST_VERIFY_SOURCE`, `PAYFAST_VALIDATE_SERVER`, `TRUST_PROXY`,
  `EMAIL_ENABLED`, `VITE_PAYFAST_ENABLED`, and
  `COURIER_INTEGRATION_ENABLED`.
- Whether any email-sending function is called from anywhere in the
  codebase, regardless of `EMAIL_ENABLED`.

## GitHub Actions Frontend Flag Status

**Already correct — no change needed.** The Build step's `env:` block
in `.github/workflows/deploy.yml` reads:

```yaml
env:
  VITE_API_BASE_URL: https://seasonedz-ecommerce.onrender.com/api
  VITE_PAYFAST_ENABLED: "false"
run: npm run build
```

Both values confirmed exactly as required:
`VITE_API_BASE_URL=https://seasonedz-ecommerce.onrender.com/api` and
`VITE_PAYFAST_ENABLED=false`. This was set explicitly during Version
3's own pre-merge hardening and Version 4 has not touched it.

## Env Example Result

All three tracked env example files confirmed safe:

**`backend/.env.example`:**
```
PAYFAST_ENABLED=false
PAYFAST_VERIFY_SOURCE=false
PAYFAST_VALIDATE_SERVER=false
TRUST_PROXY=false
EMAIL_ENABLED=false
```

All credential-shaped fields present but empty (placeholders only):
`DATABASE_URL=`, `DIRECT_URL=`, `PAYFAST_MERCHANT_ID=`,
`PAYFAST_MERCHANT_KEY=`, `PAYFAST_PASSPHRASE=`,
`EMAIL_FROM_ADDRESS=`. `EMAIL_PROVIDER=console` (a safe non-real
provider name, not a credential).

**Root `.env.example`:** `VITE_PAYFAST_ENABLED=false`, plus the
non-secret `VITE_API_BASE_URL` (safe to see in browser dev tools
either way — it's baked into the public client bundle regardless of
where it's set).

**`.env.production.example`:** Only `VITE_API_BASE_URL` — no PayFast
flags declared at all, which is safe by omission (the frontend code
treats a missing `VITE_PAYFAST_ENABLED` the same as `"false"`).

No secrets of any kind found in any tracked file (confirmed via a
repo-wide search for credential-shaped patterns, not just these three
files).

## Render Deployment Requirements — Manual Checklist Before Merging

**I cannot check Render's dashboard from here (no access) — this is a
checklist for you to verify manually, not something I can confirm
myself.** Nothing below asks you to paste real values back to me —
just confirm each one is in the state described:

- [ ] `PAYFAST_ENABLED` is **false, or not set**.
- [ ] `PAYFAST_VERIFY_SOURCE` is **false, or not set**.
- [ ] `PAYFAST_VALIDATE_SERVER` is **false, or not set**.
- [ ] `TRUST_PROXY` is **false, or not set**.
- [ ] `EMAIL_ENABLED` is **false, or not set**.
- [ ] **PayFast credential variables are not present** —
      `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`,
      `PAYFAST_PASSPHRASE` should not exist as Render environment
      variables at all (not even sandbox values) unless you have a
      specific reason to keep them there for future local-to-Render
      testing.
- [ ] `DATABASE_URL` and `DIRECT_URL` are **present** and still valid
      (the Supabase credentials haven't rotated or expired since the
      last deploy).
- [ ] `FRONTEND_PRODUCTION_URL` is **correct** — the live GitHub Pages
      origin (scheme + host only, no path).
- [ ] **Render service branch is `main`** — the service is configured
      to deploy from `main`, not from `version-4-payfast-hardening` or
      any other branch.

## Would Merging Activate Any Real Payment, Email, or Courier Behaviour?

**No, if production env flags remain false or unset.**

- Backend: `PAYFAST_ENABLED`, `PAYFAST_VERIFY_SOURCE`,
  `PAYFAST_VALIDATE_SERVER`, `TRUST_PROXY`, and `EMAIL_ENABLED` all
  default to `false` in code (`backend/src/config/env.ts`) when absent
  — merging this code into `main` cannot itself flip any of them on. A
  real behaviour would only ever activate if someone deliberately sets
  the corresponding variable to `true` in Render's dashboard (see
  checklist above).
- Email, specifically, is safe on **two independent levels**: the
  `EMAIL_ENABLED` flag, *and* — confirmed by a direct code search this
  review — no controller or service anywhere in the codebase calls any
  `send*Email` function at all yet, regardless of the flag. There is
  currently no code path that would send an email even if
  `EMAIL_ENABLED=true` were set by mistake.
- Courier: `COURIER_INTEGRATION_ENABLED` is hardcoded `false` directly
  in code (`backend/src/config/delivery.ts`) — there is no env var to
  even misconfigure, so merging cannot activate courier behaviour under
  any circumstance.
- Frontend: `VITE_PAYFAST_ENABLED` defaults to `false` in the
  production build regardless of merge (see "GitHub Actions Frontend
  Flag Status" above).
- **Startup safety:** merging and deploying this code would not crash
  the live backend even if Render's dashboard has none of Version 4's
  new env vars (`PAYFAST_VERIFY_SOURCE`, `PAYFAST_VALIDATE_SERVER`,
  `TRUST_PROXY`) set at all — their absence is exactly the default,
  safe, already-tested state (see
  `VERSION_4_PAYFAST_SOURCE_VERIFICATION.md`).

## Is Merge Safe?

**Yes, from a code/config safety standpoint** — nothing in this branch
activates real payments, real email, or courier behaviour by default,
and the backend won't fail to start due to missing Version 4 env vars.
The only outstanding item is the Render manual checklist above, which
you're best placed to verify since it requires dashboard access.

## Is Deployment Safe?

**Deployment is a separate decision from merging** — merging `main`
alone does not deploy anything by itself in this project (the GitHub
Pages workflow triggers on push to `main`, so a merge *would* trigger a
frontend redeploy; the backend on Render is a separate service — confirm
its auto-deploy setting if you're unsure whether it redeploys on push
to `main` too, and confirm its branch setting per the checklist above).
If deployment does happen as a consequence of merging, it is safe under
the same conditions as above: the code stays inert by default
regardless.

## Is Production PayFast Ready?

**No.** Two known blockers, both already identified during Version 4's
own QA (`VERSION_4_QA_PRODUCTION_READINESS_REVIEW.md`), remain
unresolved:

1. **Source verification's acceptance path is unproven.**
   `PAYFAST_VERIFY_SOURCE=true` correctly and safely *rejected* a real
   PayFast ITN through the tunnel used in Milestone 30's hosted round
   trip — but no genuine PayFast-originated request has ever been
   correctly *accepted* by this check. The exact cause (tunnel IP
   forwarding vs. a genuine DNS/IP mismatch) was not isolated.
2. **Retry while `PENDING` has a duplicate-payment risk.** A customer
   can retry a PayFast payment that's still genuinely pending (not yet
   confirmed failed or abandoned); if both the original and the retried
   attempt are separately completed on PayFast's side, this backend's
   idempotency only protects against a duplicate ITN for the *same*
   completed payment, not against two genuinely separate successful
   PayFast payments for one order.

Neither blocker is exploitable today — `PAYFAST_ENABLED` is `false` in
every deployed environment, so no real PayFast payment can happen at
all yet. Both must be resolved, or formally and separately accepted as
documented trade-offs, before `PAYFAST_ENABLED=true` is ever set
anywhere real. Merging to `main` does not change this either way.
