# Version 7, Milestone 58B: Admin Auth Deployment and Bootstrap Safety Review

**Status: planning and verification only. Nothing in this document has been executed.**
No merge, no deploy, no migration apply, no admin setup script run, no admin user created, no Render or GitHub Actions changes were made while producing this document.

---

## 1. Current State

| Item | Status |
|---|---|
| `main` | `6bd7997` — no admin auth code, no admin route, nothing deployed |
| `version-7-admin-auth-foundation` | `39ece7c` — pushed to `origin` for backup/review, not merged |
| Migration `20260718203408_add_admin_auth` | Generated, **pending** — confirmed via `prisma migrate status` against the live shared Supabase database |
| `AdminUser` table | Exists (pre-dates this milestone) with **0 rows** — confirmed via raw SQL count |
| `AdminSession` table | Does not exist yet — created only when the migration is applied |
| Admin bootstrap script | Written (`backend/prisma/scripts/setupAdminUser.ts`), **never run** |
| Admin API | Not deployed — exists only on the unmerged branch |
| Admin route (`/admin`, `/admin/login`) | Not on `main`, not deployed |
| `ADMIN_SESSION_SECRET` on Render | Not set — backend falls back to a random per-process secret when absent, so this is safe, not a blocker |
| PayFast | `PAYFAST_ENABLED=false` in production — untouched by this branch entirely |

### Branch review summary

- **Prisma migration** (`backend/prisma/migrations/20260718203408_add_admin_auth/migration.sql`): purely additive. Adds `passwordHash` (`TEXT NOT NULL`, no default — safe only because `AdminUser` is currently empty) and `lastLoginAt` (`TIMESTAMP` nullable) to the existing `AdminUser` table; creates the new `AdminSession` table with a unique index on `tokenHash`, indexes on `adminUserId`/`expiresAt`, and a cascading FK to `AdminUser`. Touches no other table.
- **Prisma schema**: `AdminUser` and `AdminSession` models match the migration exactly. No changes to `Product`, `Order`, `OrderItem`, `Payment`, `Shipping`, `Enquiry`, `Customer`, or `Category`.
- **Admin auth routes** (`backend/src/routes/adminAuth.routes.ts`, mounted at `/api/admin/auth`): only `POST /login` (rate-limited, 5/15min), `POST /logout`, `GET /me` (behind `requireAdminAuth`). `routes/index.ts` confirms every other `/api/admin/*` path remains unmounted — a 404, not a security hole.
- **Admin middleware** (`requireAdminAuth.middleware.ts`): checks for the signed cookie before any database call, so unauthenticated requests are rejected with zero Prisma interaction — this also means it works correctly today even though the migration is unapplied.
- **Admin setup script** (`setupAdminUser.ts`): reads `ADMIN_SETUP_EMAIL`/`ADMIN_SETUP_PASSWORD` from inline env vars only, rejects weak passwords (< 12 chars, or missing a letter or number) without ever printing the password, upserts exactly one row by email, never runs automatically (no build/postinstall/CI hook calls it).
- **Frontend**: `/admin/login` (email/password form only) and `/admin` (calls `GET /me`, shows a "signed in as X" placeholder with a sign-out button, redirects to login if unauthenticated). Neither route is linked from header/footer/nav. No order/enquiry/customer/product data is fetched or rendered anywhere in this branch's frontend code.
- **Environment**: `ADMIN_SESSION_SECRET` is read via `getOptionalEnv` in `backend/src/config/env.ts` and is never eagerly required — confirmed the backend cannot crash on startup from its absence, unlike `DATABASE_URL`/`DIRECT_URL`. `backend/.env.example` has three empty placeholders and no real file was touched.
- **`VERSION_7_ADMIN_AUTH_FOUNDATION_RESULT.md`**: matches the code as reviewed above; its "not implemented yet" and "production migration note" sections already anticipate this deployment/bootstrap step as a separate approval, consistent with this plan.

**Conclusion of review: the branch is safe to deploy following the ordered plan below. No inconsistency found between the code, the migration, and the milestone-58 result document.**

---

## 2. Deployment Order Plan

Each step requires separate, explicit approval before proceeding to the next. None of these steps have been executed.

| Step | Action | Approval gate |
|---|---|---|
| 1 | Set `ADMIN_SESSION_SECRET` in Render (Environment tab) to a strong, randomly generated secret (e.g. `openssl rand -hex 32`, generated locally, never pasted into any AI tool, chat, or document) | Owner sets it directly in the Render dashboard |
| 2 | Apply the production migration: `npx prisma migrate deploy` run against the production `DATABASE_URL`, from a trusted machine/shell | Owner approval required before running |
| 3 | Run the admin setup script once, with the owner's chosen real email/password supplied as inline env vars for that single invocation only | Owner approval + owner supplies credentials directly, not via this session |
| 4 | Verify `AdminUser` row count is exactly 1 and `passwordHash` is a non-empty hash, via a query that never selects or prints the password/hash value itself (e.g. `SELECT id, email, role, isActive, length(passwordHash) > 0 AS has_hash FROM "AdminUser";`) | Verification only, no approval needed to check |
| 5 | Merge `version-7-admin-auth-foundation` into `main` (after steps 1-4 are confirmed done and correct) | Owner approval required |
| 6 | Deploy `main` (GitHub Actions → Render, per existing pipeline) | Automatic once merged, per existing CI/CD — owner should still watch it complete |
| 7 | Test `/admin/login` loads correctly in production | Verification only |
| 8 | Test invalid login (wrong password) fails safely with the generic message, no leaked detail | Verification only |
| 9 | Test successful login **only using the owner's own real credentials, entered by the owner** — this assistant will not receive, type, or handle the real password at any point | Owner performs this step personally |
| 10 | Test `/admin` protected placeholder shows "signed in as" and nothing else | Verification only |
| 11 | Confirm no order/enquiry/customer/product admin routes exist in production (still 404) | Verification only |
| 12 | Confirm PayFast remains disabled in production (`PAYFAST_ENABLED=false` unchanged) | Verification only |

This order specifically avoids ever having a deployed login route that points at an admin table with no valid admin user, and avoids merging code before the database and credentials it depends on are ready and confirmed — reducing the "confusing broken state" window to zero.

---

## 3. Secret Handling Plan

- **`ADMIN_SESSION_SECRET`** must be generated by the owner (e.g. `openssl rand -hex 32` run locally) and pasted directly into the Render environment variable UI. It must **not** be typed into this chat, any AI assistant, any document in this repository, or any file tracked by git.
- **Admin password** must be chosen and entered only by the authorised owner, directly into whatever terminal runs the setup script or directly into the production login form. It must never be sent to this assistant, never pasted into Claude/ChatGPT or any other AI tool, never written to a file in this repo, and never committed.
- **No credential of any kind** (session secret, admin email, admin password) should be sent over WhatsApp, email, Slack, or any other message channel — treat these the same as a database password.
- **No real credentials should ever appear in terminal logs.** The setup script is already written to only log `email`, `role`, and `isActive` on success — never the password or its hash. Anyone running it should still avoid enabling shell history syncing/screen-recording while typing the password inline.
- If a secret is ever accidentally pasted anywhere (chat, doc, commit), treat it as compromised: generate a new one immediately and rotate it in Render — do not assume "it was just for a moment" is safe.

---

## 4. Migration Safety Plan

- **Migration to apply:** `backend/prisma/migrations/20260718203408_add_admin_auth/migration.sql` (the only pending migration — `prisma migrate status` confirms exactly one).
- **Tables/columns added:**
  - `AdminUser` gains two new columns: `passwordHash` (`TEXT NOT NULL`) and `lastLoginAt` (`TIMESTAMP NULL`).
  - New table `AdminSession` (`id`, `adminUserId`, `tokenHash` unique, `expiresAt`, `createdAt`, `lastUsedAt`), with an index on `adminUserId` and `expiresAt`, and a `CASCADE`-delete foreign key to `AdminUser`.
- **Why it cannot affect orders/products/payments/enquiries:** the migration's `ALTER TABLE`/`CREATE TABLE` statements name only `AdminUser` and `AdminSession` — no other table appears anywhere in the SQL file. `AdminUser` itself has zero foreign keys pointing at `Order`, `Product`, `Payment`, `Shipping`, `Enquiry`, or `Customer`, so there is no cascading or shared-column risk. The `passwordHash NOT NULL` addition is only safe because `AdminUser` currently has 0 rows (confirmed) — if that ever changes before this migration is applied, it would need a default value or a backfill step added first.
- **Check migration status before:** `cd backend && npx prisma migrate status` — should show `20260718203408_add_admin_auth` as pending, no others.
- **Check migration status after:** re-run the same command — should show "Database schema is up to date," no pending migrations.
- **Confirm `AdminUser`/`AdminSession` exist correctly after:** `SELECT column_name FROM information_schema.columns WHERE table_name = 'AdminUser';` should list `passwordHash` and `lastLoginAt` alongside the existing columns; `SELECT table_name FROM information_schema.tables WHERE table_name = 'AdminSession';` should return one row.
- **If the migration fails:** stop immediately, do not retry blindly. Because `AdminUser` is currently empty, the most likely failure mode is a connection/permission issue rather than a data conflict — check the error message, check `DATABASE_URL`/`DIRECT_URL` connectivity, and re-run `prisma migrate status` to see whether it partially applied. Prisma migrations run in a single transaction per migration file for Postgres, so a failure should leave the schema unchanged rather than half-applied — but always re-check status rather than assuming. Do not attempt `prisma migrate reset` (destroys all data) under any circumstance in this shared database. Escalate to the owner before any retry if the cause isn't immediately obvious.

---

## 5. Bootstrap Safety Plan

- **How to run:** exactly once, inline environment variables, never written to a file:
  ```
  ADMIN_SETUP_EMAIL=owner-chosen@example.com ADMIN_SETUP_PASSWORD='owner-chosen-strong-password' \
    npx tsx prisma/scripts/setupAdminUser.ts
  ```
  Run from `backend/`, after the migration from Step 2 is confirmed applied.
- **Required env vars:** `ADMIN_SETUP_EMAIL` (required), `ADMIN_SETUP_PASSWORD` (required); `ADMIN_SETUP_NAME` is optional and defaults to `"Admin"`.
- **Password rules (already enforced by the script):** minimum 12 characters, must contain at least one letter and one number. The script aborts and creates/changes nothing if the password fails this check — and never logs the rejected password.
- **Confirm the admin user exists without printing the password:** the script's own success line already does this (`Admin user ready: email="..." role="ADMIN" isActive=true`). Independently, a query such as `SELECT id, email, role, isActive, "createdAt" FROM "AdminUser";` confirms existence without ever selecting `passwordHash`.
- **How to avoid creating multiple admin users accidentally:** the script uses `upsert` keyed on `email` — running it again with the *same* email updates that one row (name/password/active) rather than creating a duplicate, since `email` is `@unique` in the schema. Running it with a *different* email creates a second admin, which is only appropriate if the owner deliberately wants a second admin/staff account — always double-check the email argument before running.
- **Deactivating an admin later:** set `isActive = false` on their `AdminUser` row (e.g. via a one-off SQL update, since no admin-management UI exists yet) — `requireAdminAuth`'s underlying `validateSession` already checks `adminUser.isActive` and will reject sessions for a deactivated user immediately, even ones already issued.
- **Rotating a password:** re-run the bootstrap script with the same email and a new password — the `upsert`'s `update` branch overwrites `passwordHash`. This does **not** automatically invalidate existing sessions for that user (sessions are separate rows keyed on the session token, not tied to password value) — if a full "kick out everywhere" is needed, that requires a manual `DELETE FROM "AdminSession" WHERE "adminUserId" = '...'`, which is not yet exposed as a script or endpoint (candidate for a future milestone).

---

## 6. Merge and Deploy Safety Plan

- **Do not merge** `version-7-admin-auth-foundation` into `main` until: the migration (Step 2) is applied, and the first real admin user (Step 3) is created and verified (Step 4) — merging code that expects a schema/admin-user state that doesn't exist yet would deploy a login page that can never succeed, which is confusing but not unsafe; the ordering above simply avoids that dead-end window entirely.
- **After merge:** GitHub Actions should run and pass exactly as it does for every other merge to `main` — nothing in this branch touches the CI workflow files themselves.
- **Render should remain healthy** after deploy — `GET /api/health` should continue returning 200, and startup should succeed with or without `ADMIN_SESSION_SECRET` set (though it should be set per Step 1 before this point).
- **Admin login page should be accessible** at `<frontend-origin>/#/admin/login` once the frontend deploy completes — reachable only by direct URL, exactly as designed (no nav link).
- **Private admin data should not be accessible** because no read-only or read-write dashboard exists yet in this branch — `/admin` only ever shows "signed in as {name} ({email})," and every `/api/admin/{orders,enquiries,products,customers}` path remains unmounted (404). Confirm this explicitly as part of Step 11 above, both immediately after deploy and again as a habit before any future admin-dashboard milestone ships.

---

## 7. Rollback Plan

- **If login breaks but the public site works:** PayFast stays disabled regardless (this branch never touches it) — decide separately whether to roll back the frontend/backend deploy to the pre-merge commit (`6bd7997` or whatever `main` was immediately before this merge) via Render's redeploy-previous-commit feature and reverting the merge commit on `main`. A broken admin login is not urgent enough to risk a rushed rollback of the whole site; take time to diagnose first (check Render logs, check `ADMIN_SESSION_SECRET` is actually set, check the migration actually applied) before rolling back.
- **If the migration succeeds but the code deploy fails:** the database changes (new nullable/empty-safe columns and a new empty-referencing table) are additive and inert without the corresponding code — they can safely remain in place while the code deploy is retried or debugged. No need to revert the migration to unblock a code fix.
- **If the admin credential turns out to be wrong** (typo in email, forgotten password): re-run the bootstrap script securely (Section 5's "rotating a password") with the same email and a new password. Do not attempt to recover the old password (it's a one-way hash by design) — resetting is the only path, which is expected and fine for a single-admin foundation.
- **Never delete order, product, payment, enquiry, or customer data** as part of any rollback related to this milestone — nothing in this rollback plan should ever require touching those tables, and none of the steps above do.

---

## 8. Approval Checklist

Before proceeding past this planning document, the owner should explicitly confirm each of the following, in order:

- [ ] `ADMIN_SESSION_SECRET` generated and set in Render (Step 1)
- [ ] Approval given to run `prisma migrate deploy` against production (Step 2)
- [ ] Migration applied and verified via `prisma migrate status` (post-Step 2 check)
- [ ] Real admin email and password chosen by the owner (kept private, not shared with this assistant)
- [ ] Approval given to run the bootstrap script once (Step 3)
- [ ] `AdminUser` count verified as 1, with a non-empty `passwordHash`, without printing the password (Step 4)
- [ ] Approval given to merge `version-7-admin-auth-foundation` into `main` (Step 5)
- [ ] Deploy completes and GitHub Actions passes (Step 6)
- [ ] `/admin/login` reachable in production (Step 7)
- [ ] Invalid login confirmed to fail safely in production (Step 8)
- [ ] Owner personally confirms successful login with their own real credentials (Step 9)
- [ ] `/admin` protected placeholder confirmed to show no private data (Step 10)
- [ ] No order/enquiry/customer/product admin routes exist in production (Step 11)
- [ ] PayFast confirmed still disabled in production (Step 12)

None of these are checked as part of this document — this is the plan, not the execution.
