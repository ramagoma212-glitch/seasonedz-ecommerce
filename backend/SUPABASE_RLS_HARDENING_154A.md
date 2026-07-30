# Supabase RLS Security Hardening — Milestone 154A

**Status: audit + plan only. No production RLS/GRANT changes applied.
No push, no merge, no deploy.** Branch: `version-7-supabase-rls-hardening`,
created from `version-7-digital-upload-limit-fix` (commit `7693052`,
"Match digital upload limit to Supabase bucket" — preserved, see
`RLS_HARDENING_154A_50MB_CHECK.md` section below).

## Task 1 — Access-pattern audit

All 16 points below were checked directly against this repository's
code and, where noted, against the live Supabase project via safe,
read-only Postgres system-catalog queries (no application data was
read, inserted, updated, or deleted by any check in this audit).

### 1. Prisma schema

`backend/prisma/schema.prisma` defines 18 models: `Category`, `Product`,
`DigitalAsset`, `ProductImage`, `ProductTag`, `Customer`, `Address`,
`CustomerSession`, `Order`, `OrderItem`, `DigitalDownloadLog`,
`GuestDownloadToken`, `Payment`, `Shipping`, `Enquiry`, `AdminUser`,
`AdminSession`, `OrderStatusHistory`. `Product.tags`/`ProductTag.products`
is an implicit many-to-many, which Prisma materializes as a hidden join
table `_ProductToProductTag`. Together with Prisma's own bookkeeping
table `_prisma_migrations`, that is **20 tables in the `public` schema —
an exact match for the owner's 20 Security Advisor warnings** and for
the 20 table names listed in this milestone's brief.

### 2. All existing Prisma migrations

```
20260712235103_init
20260718203408_add_admin_auth
20260719095604_add_order_status_history
20260723145031_add_courier_booking_fields
20260724235023_add_customer_auth_fields
20260726180000_add_courier_auto_booking_failure_fields
20260730001757_add_secure_digital_downloads
```

None of these seven migrations contain any `ENABLE ROW LEVEL SECURITY`,
`GRANT`, or `REVOKE` statement — RLS has never been touched by this
project's own migration history. The grants currently on every table
(see point 3 below) were placed there by **Supabase's own default
behaviour for newly created tables in the `public` schema**, not by
anything this codebase did.

### 3 & 4. Backend database connection method and role

`backend/prisma/schema.prisma`'s datasource block:

```
url       = env("DATABASE_URL")   // pooled (pgbouncer), used at runtime
directUrl = env("DIRECT_URL")     // direct (non-pooled), used only by Prisma Migrate
```

Confirmed live (safe, read-only queries against Postgres system
catalogs — no data touched):

```
SELECT current_user, session_user;
→ postgres, postgres

SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
→ postgres, rolsuper=false, rolbypassrls=true
```

**The backend connects as the `postgres` role, which has `BYPASSRLS`.**
A role with `BYPASSRLS` ignores Row Level Security entirely, on every
table, on every query, regardless of what policies exist or don't.
Both `DATABASE_URL` and `DIRECT_URL` were confirmed (by inspecting only
the username portion of each connection string — no password was ever
read or printed) to authenticate as the identical role
(`postgres.<project-ref>`, Supabase's pooler naming convention for the
same underlying `postgres` role). This means **both the app's runtime
queries and Prisma Migrate's schema-change queries bypass RLS
identically** — directly answering the `_prisma_migrations` safety
question in Task 2 below.

### 5, 6 & 7. Frontend direct Supabase access, anon key exposure, Supabase JS usage scope

Repo-wide search: `@supabase/supabase-js` or `createClient` appears in
exactly **two files, both backend-only**:
- `backend/src/services/supabaseStorage.service.ts` (public
  `product-images` bucket)
- `backend/src/services/digitalAssetStorage.service.ts` (private
  `digital-products` bucket)

Both construct their Supabase client with `SUPABASE_SERVICE_ROLE_KEY`
(never the anon key), and both only ever call Storage methods
(`.storage.from(...).upload()/.createSignedUrl()/.remove()`) — **never**
`.from(<table>).select()/.insert()` or any other PostgREST table
operation. Neither file is imported by any frontend code (`src/`).

Zero occurrences anywhere in `src/` of `supabase-js`, `createClient`, or
`SUPABASE_ANON_KEY`. The live production JS bundle was independently
inspected and contains no Supabase key of any kind.

**Definitive finding: the browser never talks to the Supabase database
directly. Every single piece of data the frontend ever sees or writes
goes through this project's own Express/Prisma backend API
(`api.seasonedzgroup.co.za`) and nothing else.** The only two things the
browser ever fetches from `*.supabase.co` directly are already-public
Storage object URLs (product photos) and short-lived signed URLs for
paid digital downloads — both content delivery, not database queries.

### 8. Product catalogue API

`backend/src/services/product.service.ts` — every read is
`prisma.product.findMany/findFirst/...`. No Supabase client, no raw
PostgREST call. Confirmed via `grep -c "prisma\." services/product.service.ts`.

### 9. Admin API

No file under `backend/src/services/admin*.ts` or
`backend/src/controllers/admin*.ts` imports `@supabase/supabase-js` or
`supabase-js` at all (confirmed by direct grep across all admin
service/controller files) — every admin read/write is a Prisma call
gated by `requireAdminAuth` middleware.

### 10. PayFast ITN flow

`backend/src/services/payfast.service.ts` — 12 separate `prisma.*`
calls handle order lookup, amount verification, and status transition.
No Supabase table access of any kind.

### 11. Courier Guy flow

`backend/src/services/courierGuy.service.ts` — 8 separate `prisma.*`
calls. Quote/booking calls go to Courier Guy's own external API, never
Supabase.

### 12. Customer account / order history

`backend/src/services/customerOrder.service.ts` (order history) and
`backend/src/services/customerAuth.service.ts` (login/session) — both
Prisma-only. No Supabase table access.

### 13. Digital download service

`backend/src/services/digitalDownload.service.ts` — 10 separate
`prisma.*` calls handle every ownership/payment-status check. The one
Supabase call in this whole flow is `createSignedDownloadUrl()` from
`digitalAssetStorage.service.ts` — a Storage signed-URL call, not a
table query, and only ever reached after the Prisma-based checks above
already passed.

### 14. Guest download token service

Same file as point 13 (`createGuestDownloadToken`, `resolveGuestToken`)
— 3 of the 10 Prisma calls above are specifically
`prisma.guestDownloadToken.*`. No separate Supabase access path exists
for guest tokens.

### 15. Enquiry / contact form

`backend/src/services/enquiry.service.ts` — 3 `prisma.*` calls. No
Supabase table access.

### 16. Tests

`tests/smoke/` — zero references to `supabase` anywhere. Every smoke
test drives the real frontend against either the local throwaway build
or the live site, and the app itself never calls Supabase for data (per
points 5-7), so no test needs to know about Supabase's database layer
at all.

## Bottom-line finding (as explicitly required by this milestone)

**The browser never talks directly to Supabase database tables. It
only ever talks to this project's own backend API.** Supabase's
PostgREST Data API (the thing RLS actually protects against) is a
capability this application has never used and never exposed a key
for. The 20 "RLS Disabled in Public" warnings describe a real,
unused-but-reachable attack surface — not a false positive, but not
something the app itself relies on either.

Confirmed live: `anon`/`authenticated` currently hold full
`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER` grants
on all 20 tables (40 grant rows = 20 tables × 2 roles), 0 existing RLS
policies, all 20 tables `rowsecurity: false`.

## Task 2 — RLS strategy chosen

Because the audit conclusively found **no legitimate use, anywhere in
this app, for direct Supabase table access from `anon` or
`authenticated`** — not even for catalogue data, which the storefront
already reads exclusively through the backend API — the chosen
strategy is the simplest and strongest one available:

> **Enable RLS with zero policies on all 20 tables. Revoke the
> `anon`/`authenticated` grants outright. Add no public read policies
> anywhere, including on catalogue tables.**

This is a stricter choice than the milestone brief's "if direct public
read is not needed, enable RLS with no public policies here too" — that
condition is exactly what was found to be true for `Product`, `Category`,
`ProductImage`, `ProductTag`, and `_ProductToProductTag`, so they get the
same treatment as the 14 explicitly sensitive tables (`Customer`,
`Address`, `Order`, `OrderItem`, `Payment`, `Shipping`, `AdminUser`,
`AdminSession`, `CustomerSession`, `OrderStatusHistory`, `Enquiry`,
`DigitalAsset`, `DigitalDownloadLog`, `GuestDownloadToken`) plus
`_prisma_migrations`. No table in this project needs a public Supabase
policy, so none is added — fewer moving parts than maintaining
catalogue-specific policies that would need to independently replicate
the backend's own `status = 'ACTIVE'` / non-draft filtering logic in
SQL to avoid leaking draft products, and would need to be kept in sync
by hand forever after.

### Why this cannot break the live app

- The backend's *only* Postgres role (`postgres`, both via pooled
  `DATABASE_URL` and direct `DIRECT_URL`) has `BYPASSRLS` — confirmed
  live. RLS state is invisible to it, unconditionally.
- `REVOKE ... FROM anon, authenticated` never touches `postgres` — table
  ownership and superuser-adjacent grants are separate from these two
  PostgREST-only roles.
- No policies are added, so there is no policy logic to get subtly
  wrong for any role that matters.
- Storage bucket privacy (`product-images` public, `digital-products`
  private) lives in the separate `storage` schema and is untouched by
  anything here.

### `_prisma_migrations` — specifically addressed per Task 2's instruction not to rush this table

Confirmed safe, for the same reason as every other table: **Prisma
Migrate authenticates via `DIRECT_URL`, which uses the identical
`postgres` role as the app's runtime `DATABASE_URL`** (verified by
comparing only the username segment of each connection string — no
password was read or printed). Since that role bypasses RLS
unconditionally, enabling RLS on `_prisma_migrations` has zero effect on
any future `prisma migrate dev`/`deploy` run. No special exception or
alternative approach is needed for this table; it is included in the
same fix as the other 19.

## Task 3 — Prepared fix (NOT applied)

`backend/prisma/rls_hardening_154A.sql` contains the full fix:

1. `REVOKE ALL ... FROM anon, authenticated` on all 20 tables.
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all 20 tables — zero
   policies added anywhere.
3. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE
   ALL ON TABLES FROM anon, authenticated` — so the next Prisma
   migration that creates a table doesn't silently reinherit Supabase's
   default public-schema grants (which is how all 20 existing tables
   ended up exposed in the first place — nothing in this app's code
   granted them).

Deliberately **not** a Prisma migration file: Prisma's schema DSL has no
RLS/GRANT syntax, and this repo's build/deploy pipeline never runs
`prisma migrate deploy` automatically (confirmed:
`backend/package.json`'s `build` script is only `prisma generate && tsc`,
and Render's `buildCommand` mirrors that) — so a plain, clearly-labeled
SQL file that requires a human to run it manually is strictly safer
than anything that could be picked up by an automated pipeline by
accident. Includes a full commented-out rollback block.

**This SQL has not been run against the live database.** It requires
explicit owner review and approval, per this milestone's instructions.
