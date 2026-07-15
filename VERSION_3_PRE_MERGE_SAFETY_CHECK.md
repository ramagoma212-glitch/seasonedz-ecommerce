# Version 3 — Pre-Merge Production Environment Safety Check

A production environment safety review of `version-3-payments-delivery`
before merging into `main`. **This review changed no code** — it
audited what already exists and documents what to verify. No merge, no
deploy, no push happened as part of this review.

## What Was Checked

- `main` is untouched at `5914546` (confirmed, local and remote).
- `version-3-payments-delivery` is pushed and tracking
  `origin/version-3-payments-delivery` at `38d5226` (confirmed, local
  and remote hashes match).
- `.github/workflows/deploy.yml` — the production frontend build step.
- Both tracked `.env.example` files (root and `backend/`).
- Code-level default behaviour of `PAYFAST_ENABLED`, `EMAIL_ENABLED`,
  `VITE_PAYFAST_ENABLED`, and `COURIER_INTEGRATION_ENABLED`.

## GitHub Actions Frontend Flag Status

**Updated — `VITE_PAYFAST_ENABLED` is now explicitly set to `"false"`
in `.github/workflows/deploy.yml`** (production safety hardening step,
applied after this document was first written). The Build step's
`env:` block now reads:

```yaml
env:
  VITE_API_BASE_URL: https://seasonedz-ecommerce.onrender.com/api
  VITE_PAYFAST_ENABLED: "false"
run: npm run build
```

This was already the *effective* behaviour before this change — the
frontend code (`src/js/orders.js`) reads the flag defensively
(`(import.meta.env.VITE_PAYFAST_ENABLED || "").toLowerCase() ===
"true"`), so an unset variable already evaluated to `false`. Setting it
explicitly removes any dependence on a reader knowing that default:
the workflow file itself now states the production safety posture
directly, the same way `VITE_API_BASE_URL` already is (neither value
is secret — both get baked into the public client bundle regardless).
**The production build does not show PayFast as selectable, now
explicitly by design rather than only by an unstated default.**

## Tracked Env Example Result

Both files confirmed correct, placeholders only, no secrets:

| File | Confirmed |
|---|---|
| `.env.example` (root) | `VITE_PAYFAST_ENABLED=false` ✅. Only other variable is `VITE_API_BASE_URL` (a public URL, not secret). |
| `backend/.env.example` | `PAYFAST_ENABLED=false` ✅, `EMAIL_ENABLED=false` ✅. All credential fields (`PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`, `DATABASE_URL`, `DIRECT_URL`, `RESEND_API_KEY`, `SENDGRID_API_KEY`, `SMTP_*`, etc.) are empty placeholders. No real values present. |

## Render Deployment Requirements — Manual Checklist Before Merging

**I cannot check Render's dashboard from here (no access) — this is a
checklist for you to verify manually, not something I can confirm
myself.** Nothing below asks you to paste real values back to me —
just confirm each one is in the state described:

- [ ] `PAYFAST_ENABLED` is **not set, or explicitly `false`**.
- [ ] `PAYFAST_MODE` is **`sandbox` or unset** — not `production`.
- [ ] **No live/production PayFast credentials are active** on the
      Render service (i.e. whatever `PAYFAST_MERCHANT_ID`/
      `PAYFAST_MERCHANT_KEY`/`PAYFAST_PASSPHRASE` are set, if any, are
      sandbox values, not a real production PayFast account).
- [ ] `EMAIL_ENABLED` is **not set, or explicitly `false`**.
- [ ] `COURIER_INTEGRATION_ENABLED` is **not present, or `false`** —
      note this isn't an env var yet at all
      (`backend/src/config/delivery.ts` hardcodes it `false` in code),
      so there's nothing to accidentally misconfigure here today; this
      only matters once a future milestone turns it into a real env
      var.
- [ ] `DATABASE_URL` and `DIRECT_URL` are **still valid** (the Supabase
      credentials haven't rotated or expired since the last deploy).
- [ ] `FRONTEND_PRODUCTION_URL` is **still the correct live GitHub
      Pages origin** (`https://ramagoma212-glitch.github.io` — scheme +
      host only, no path).

## Would Merging Activate Any Real Payment, Email, or Courier Behaviour?

**No, if production env flags remain false.**

- Backend: `PAYFAST_ENABLED` and `EMAIL_ENABLED` both default to
  `false` in code (`backend/src/config/env.ts`) when absent — merging
  this code into `main` cannot itself flip either flag on. A real
  provider would only ever activate if someone deliberately sets
  `PAYFAST_ENABLED=true`/`EMAIL_ENABLED=true` in Render's dashboard
  (see checklist above).
- Courier: `COURIER_INTEGRATION_ENABLED` is hardcoded `false` directly
  in code — there is no env var to even misconfigure yet, so merging
  cannot activate courier behaviour under any circumstance.
- Frontend: `VITE_PAYFAST_ENABLED` defaults to `false` in the
  production build regardless of merge (see "GitHub Actions Frontend
  Flag Status" above).
- **Startup safety:** merging and deploying this code would not crash
  the live backend even if Render's dashboard has none of the new
  Version 3 env vars set at all — `PAYFAST_ENABLED`/`EMAIL_ENABLED`
  being absent is exactly the default, safe, already-tested state (see
  `backend/PAYFAST_SETUP.md`/`EMAIL_SETUP.md`).

## Is Merge Safe?

**Yes, from a code/config safety standpoint** — nothing in this branch
activates real payments, real email, or courier behaviour by default,
and the backend won't fail to start due to missing Version 3 env vars.
The only outstanding item is the Render manual checklist above, which
you're best placed to verify since it requires dashboard access.

## Is Deployment Safe?

**Deployment is a separate decision from merging** — merging `main`
alone does not deploy anything by itself in this project (the GitHub
Pages workflow triggers on push to `main`, so a merge *would* trigger
a frontend redeploy; the backend on Render is a separate service not
automatically tied to this repo's merges in the same way — confirm
your Render service's auto-deploy setting if you're unsure whether it
redeploys on push to `main` too). If deployment does happen as a
consequence of merging, it is safe under the same conditions as above:
the code stays inert by default regardless.

## Is Real Live Payment Ready?

**No.** Unchanged from the Version 3 QA release review
(`VERSION_3_QA_RELEASE_REVIEW.md`): source IP verification is not
implemented, and no real end-to-end PayFast sandbox round trip has
been completed. Merging to `main` does not change this — real live
payments should not be enabled until both are addressed.
