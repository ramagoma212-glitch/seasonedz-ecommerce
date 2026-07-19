# Version 7, Milestone 58: Admin Authentication Foundation — Result

**Branch:** `version-7-admin-auth-foundation` (off `main` @ `6bd7997`)
**Scope:** Session-based admin login/logout/me only. No admin dashboard, no orders/enquiries/customer/product admin data, no PayFast or checkout changes.

## What was implemented

A backend session-based admin authentication foundation (Option A from `VERSION_7_ADMIN_DASHBOARD_PLAN.md`), plus the minimal frontend needed to sign in, land on a protected placeholder page, and sign out. Nothing beyond authentication was built.

## Backend routes added

Mounted at `/api/admin/auth`:

- `POST /api/admin/auth/login` — validates credentials, creates a session, sets an HttpOnly cookie. Rate-limited (5 requests / 15 min) via a new `adminLoginRateLimiter`. Returns only a safe profile (`id`, `name`, `email`, `role`) — never `passwordHash`. Generic `"Invalid email or password."` on any failure (unknown email, wrong password, inactive account) so the response never reveals which part was wrong.
- `POST /api/admin/auth/logout` — deletes the session server-side (if any) and clears the cookie. Idempotent — safe to call with no active session.
- `GET /api/admin/auth/me` — returns the signed-in admin's safe profile. Protected by `requireAdminAuth`; returns 401 if no valid session.

No order, enquiry, customer, or product admin routes exist. Confirmed `GET /api/admin/{orders,enquiries,products}` all 404.

## Frontend routes added

- `/admin/login` — simple email/password form, generic error banner, no autocomplete of admin state.
- `/admin` — protected placeholder. Calls `GET /api/admin/auth/me` on render; if unauthenticated, redirects to `/admin/login`; if authenticated, shows "Admin area coming next. You are signed in as {name} ({email})." and a Sign Out button. No orders, enquiries, customers, or products are fetched or displayed.

Neither route is linked from the header, footer, or any customer-facing navigation — reachable only by direct URL, and still fully enforced server-side regardless.

## Auth/session approach

Opaque random session tokens, not JWTs:

1. On login, a 32-byte random token is generated (`crypto.randomBytes(32).toString("hex")`).
2. Only a SHA-256 hash of that token is stored in the new `AdminSession.tokenHash` column — the raw token is never persisted anywhere.
3. The raw token is sent to the browser only inside an HttpOnly, signed cookie (`admin_session`). `SameSite=None; Secure` in production (required for the GitHub Pages ↔ Render cross-origin case); `SameSite=Lax`, no `Secure`, for local dev (localhost-to-localhost is same-site). Expiry: 7 days.
4. On every protected request, the raw token from the cookie is re-hashed and looked up against `AdminSession.tokenHash`; `requireAdminAuth` rejects (401) before touching the database at all if no cookie is present, and after DB lookup if the session is missing, expired, or the owning admin is inactive.
5. Logout deletes the session row server-side (by re-hashing the cookie token) and clears the cookie.

Cookie signing uses `cookie-parser` with `ADMIN_SESSION_SECRET` as defence-in-depth — it protects cookie integrity in transit, but is not the actual security boundary; every session is independently re-validated against its hashed token in the database on every request regardless.

## Password hashing approach

`bcryptjs` (pure-JS, same algorithm as native `bcrypt`, chosen to avoid native-binding build issues on Windows dev machines), 12 salt rounds. No custom hashing. No plaintext password is ever stored, logged, or included in any API response.

## Admin bootstrap process

`backend/prisma/scripts/setupAdminUser.ts`, run manually via `npm run admin:setup` — **not run during this milestone**. Reads `ADMIN_SETUP_EMAIL`, `ADMIN_SETUP_PASSWORD`, optional `ADMIN_SETUP_NAME` from the environment. Refuses to proceed if the password is under 12 characters or lacks both a letter and a number. Hashes the password with the same `hashPassword()` used by login, then upserts one `AdminUser` row by email (`role: ADMIN`, `isActive: true`). Never prints the password. Never runs automatically — no call site anywhere else in the codebase, no CI/build hook, no startup seed.

## Database / Prisma changes

`AdminUser` gained `passwordHash` (required), `isActive` (default `true`), `lastLoginAt` (nullable), `createdAt`/`updatedAt` (already present). New `AdminSession` model: `id`, `adminUserId` (FK → `AdminUser`, cascade delete), `tokenHash` (unique), `expiresAt`, `createdAt`, `lastUsedAt`, indexed on `adminUserId` and `expiresAt`.

**Migration status: generated, NOT applied.** File: `backend/prisma/migrations/20260718203408_add_admin_auth/migration.sql`, created via `prisma migrate dev --create-only` specifically so it would not touch the database. This project has a single shared Supabase Postgres database used by both local dev and production (no separate staging DB), so "apply locally" and "apply to production" are the same action — consistent with the Milestone 49-51 precedent, applying it is being left as an explicit, separate approval step rather than bundled into this milestone. `prisma generate` was run (safe, only regenerates the local TypeScript client types) to get correct types for the new models without touching the database.

**No admin user was created or seeded in production or locally.** `AdminUser` table (once the migration is applied) will start empty; the only path to creating an admin is the manual bootstrap script, run intentionally with real credentials chosen by the operator.

## Environment placeholders

`backend/.env.example` gained three empty placeholders only — no real values, no existing values touched:
```
ADMIN_SESSION_SECRET=
ADMIN_SETUP_EMAIL=
ADMIN_SETUP_PASSWORD=
```
`ADMIN_SESSION_SECRET` is optional at runtime: if unset, the backend falls back to a random, process-local secret generated at startup (with a console warning), so the live Render deployment — which has no such variable configured, and which this milestone is not permitted to configure — will not crash. Setting a real, persistent secret in Render is left for a later, explicit step.

## Security protections in place

- Passwords hashed with bcrypt (12 rounds), never stored or logged in plaintext.
- Session tokens stored only as SHA-256 hashes; raw token never persisted.
- Session cookie is HttpOnly (inaccessible to JS/XSS), `Secure` + `SameSite=None` in production, signed.
- Login rate-limited to 5 attempts / 15 minutes per the existing `express-rate-limit` pattern.
- Login failure message is generic and identical regardless of whether the email exists or the password is wrong.
- `requireAdminAuth` checks cookie presence before any database call, minimizing DB load from unauthenticated probing.
- `/api/admin/auth/me` never returns `passwordHash` or any other sensitive field.
- CORS configuration was not modified — the existing allowed-origins setup was reviewed and left as-is; it still only permits the configured frontend origin(s).
- Existing error middleware (unmodified) already suppresses verbose error detail in production, exposing it only in local dev — verified this is pre-existing behavior, not something introduced here.

## What's not implemented yet

- No admin dashboard UI beyond the "signed in" placeholder.
- No order, enquiry, customer, or product administration of any kind.
- No password reset / forgot-password flow.
- No role-based permission differences (the `role` field exists on `AdminUser` but nothing yet branches on it).
- No session listing/revocation UI, no "sign out everywhere" action.
- No production `ADMIN_SESSION_SECRET`, no admin user, no applied migration.

## Testing performed (local only)

Backend and frontend dev servers were run locally against the real (shared) Supabase database, with the migration deliberately left unapplied — so `AdminUser.passwordHash` does not yet exist as a column there. This means true end-to-end login (a real bcrypt-verified success) could not be tested in this session by design; testing focused on everything that is safely verifiable without applying the migration or creating a real admin user:

| Check | Result |
|---|---|
| Admin login page renders (form, email field, password field present) | Pass |
| Invalid login fails safely — generic `"Invalid email or password."` shown, no internal detail leaked to the browser | Pass (confirmed twice; an initial Playwright run under-waited and misreported the banner as hidden, re-tested with a longer wait and explicit response logging — backend correctly returns 500 pre-migration, frontend correctly still displays only the generic message) |
| No password logged | Pass — confirmed server logs contain no submitted password value in either the curl or browser-driven attempt |
| Unauthenticated `GET /api/admin/auth/me` returns 401 | Pass — confirmed via curl (zero DB interaction, per `requireAdminAuth` design) and via browser redirect from `/admin` to `/admin/login` |
| Logout clears session | Pass — confirmed via curl (`POST /api/admin/auth/logout` returns 200 and is idempotent with no active session) |
| Protected placeholder exposes no private data | Pass — `adminHome.js` fetches only `getCurrentAdmin()`; no order/enquiry/customer/product data is requested or rendered |
| No admin orders/enquiries/products route exists | Pass — `GET /api/admin/orders`, `/api/admin/enquiries`, `/api/admin/products` all return 404 |
| Backend build (`prisma generate && tsc`) | Pass |
| Backend lint (`tsc --noEmit`) | Pass |
| Frontend build (`vite build`) | Pass |

No real admin credentials were used at any point (`nobody@example.com` / `wrongpassword123`, a deliberately-invalid test pair). The bootstrap script was never executed.

## Production migration note

The migration `20260718203408_add_admin_auth` exists on disk but has **not** been applied to the shared Supabase database, and was not applied locally either (both are the same database). Applying it is a separate, explicit approval step for a future milestone — at that point `admin:setup` can then be run once, deliberately, with real credentials to create the first real admin user, also as its own explicit step.

## Next milestone recommendation

Apply the migration (as its own approved step), run the bootstrap script once with real credentials to create the first admin user, then begin the actual admin dashboard content (read-only order/enquiry views first, per the phased plan in `VERSION_7_ADMIN_DASHBOARD_PLAN.md`), gated behind the now-working `requireAdminAuth` middleware.
