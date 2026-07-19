# Version 7, Milestone 62: Controlled Production Migration Plan

**Planning and verification only. The migration has NOT been applied. No production schema or data was changed while producing this document.**

Governs the safe application of `backend/prisma/migrations/20260719095604_add_order_status_history/migration.sql` (built in Milestone 62, implementing `VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md`), and the subsequent merge of `version-7-order-status-audit-model-implementation` into `main`. Each phase below requires separate, explicit approval before proceeding to the next — none have been executed yet.

## Migration File

`backend/prisma/migrations/20260719095604_add_order_status_history/migration.sql`

## Pre-Migration Checks (Re-Verified While Producing This Document)

| Check | Result |
|---|---|
| Working tree clean | Confirmed |
| Branch is `version-7-order-status-audit-model-implementation` at `21da5e3` | Confirmed |
| Migration not recorded in `_prisma_migrations` | Confirmed — query for `20260719095604_add_order_status_history` returns zero rows |
| `OrderStatusHistory` table does not exist | Confirmed — `information_schema.tables` returns zero rows for that name |
| `npx prisma migrate status` | Reports exactly one pending migration: `20260719095604_add_order_status_history` |

## Migration SQL Review

Contains exactly:
- 1× `CREATE TYPE` (`OrderStatusHistorySource` enum)
- 1× `CREATE TABLE` (`OrderStatusHistory`)
- 5× `CREATE INDEX`
- 2× `ALTER TABLE ... ADD CONSTRAINT` (foreign keys: `orderId` → `Order.id` `ON DELETE CASCADE`, `changedByAdminUserId` → `AdminUser.id` `ON DELETE SET NULL`)

**Contains no `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `DROP TABLE`, or `DROP COLUMN`** — confirmed by scanning for any line beginning with one of those keywords; the only `DELETE`-containing text is the two `ON DELETE CASCADE`/`ON DELETE SET NULL` foreign-key clauses, which describe future row-deletion *behavior*, not a command this migration itself executes.

## Backward Compatibility Review

**Confirmed by direct search: zero references to `OrderStatusHistory` anywhere in `backend/src/` or `src/`.** No route, controller, service, or frontend file reads or writes this model. This means:

- Existing production code does not read or write `OrderStatusHistory` — there is nothing to break, because nothing touches it.
- Adding a new enum and a new table cannot affect any existing route's behavior — Postgres `CREATE TYPE`/`CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE ADD CONSTRAINT` on a brand-new table never locks or alters any existing table's rows or columns.
- The existing admin dashboard (`GET /api/admin/dashboard`, `/orders`, `/orders/:orderNumber`, `/enquiries`, `/products/low-stock`) will continue to work exactly as today — none of these queries join or reference `OrderStatusHistory`.
- Existing checkout (`POST /api/orders`, `GET /api/orders/:orderNumber`, `GET /api/orders/:orderNumber/tracking`) will continue to work exactly as today — same reasoning.
- PayFast remains disabled and untouched — this migration contains no reference to `Payment`, `paymentStatus`, or any PayFast-related table/column.

## Data Backfill Requirement

**None.** Per `VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md` Section 12 (Old Orders Handling), no historical `OrderStatusHistory` row is created for any existing order — the table starts, and is expected to remain, empty until a future milestone's write endpoint creates its first real row.

## Expected Post-Migration State

| Item | Expected value |
|---|---|
| `OrderStatusHistory` table | Exists |
| `OrderStatusHistory` row count | 0 |
| `Order` rows | Unchanged (3, same statuses) |
| `Payment` rows | Unchanged (3) |
| `Product` rows | Unchanged (10) |
| `AdminUser` rows | Unchanged (1) |
| `AdminSession` rows | Unchanged (whatever it is at the time — this migration cannot affect it either way) |
| `Enquiry` rows | Unchanged (0) |

## Deployment Plan

Each phase requires separate, explicit approval. **None of these phases have been executed as part of producing this document.**

**Phase A — Pre-migration checks.** Re-run the checks in this document's "Pre-Migration Checks" table immediately before Phase B, so the state confirmed here is still true at the moment of applying (not just at planning time).

**Phase B — Run migration deploy once.**
```
cd backend
npx prisma migrate deploy
```
This is the project's existing standard command for applying pending migrations to the shared database (the same command used for every prior migration in this project). **Listed here as the future approved command only — not run as part of this planning document.**

**Phase C — Verify database schema.** After Phase B, confirm:
- `npx prisma migrate status` reports "Database schema is up to date!"
- `OrderStatusHistory` table exists (`information_schema.tables` query).
- `OrderStatusHistory` row count is 0.
- `Order`/`Payment`/`Product`/`AdminUser`/`Enquiry` row counts and all order statuses are unchanged from Phase A's baseline.

**Phase D — Merge branch into main.** Only after Phase C passes. `git checkout main && git pull origin main && git merge --no-ff version-7-order-status-audit-model-implementation`.

**Phase E — Push main.** `git push origin main`.

**Phase F — Wait for GitHub Actions and Render.** Confirm the GitHub Actions run for the merge commit completes successfully; confirm Render's backend redeploys (observable the same way prior milestones confirmed it — e.g. `GET /api/health` continuing to respond, or a route that only exists after the deploy becoming reachable).

**Phase G — Verify live app.**
- `GET https://seasonedz-ecommerce.onrender.com/api/health` → `200`.
- `POST https://seasonedz-ecommerce.onrender.com/api/payments/payfast/initiate` → `503 "PayFast payments are not enabled."`
- `GET https://seasonedz-ecommerce.onrender.com/api/admin/dashboard` (unauthenticated) → `401`.
- Live order/enquiry/product data unchanged (spot-check counts and the 3 known order numbers' statuses).
- Live admin dashboard still loads correctly for an authenticated session (owner-verified, same as every prior milestone's live-testing step).

## Rollback Guidance

- **This migration only adds a table, an enum, indexes, and foreign keys — it changes nothing about any existing table's structure or data.** This is the safest possible category of migration to have applied and then need to reconsider: nothing existing was altered, so there is nothing existing to restore.
- **If an issue is discovered before any code ever writes an audit row** (which will remain true until a future milestone's write endpoint ships), **the safest response is to leave the unused table in place and fix the surrounding code** (or, if truly necessary, fix and re-generate the migration itself) — not to drop production database objects. An unused, empty table is inert; it costs nothing to leave in place while a fix is prepared.
- **Do not use `DROP TABLE`/`DROP TYPE` in an emergency** unless the specific situation has been explicitly reviewed and approved as its own deliberate action — consistent with this project's standing discipline that destructive database operations always require explicit, separate approval, never a reflexive response to a problem.
- If the migration command itself fails partway (e.g. a connectivity issue mid-apply), re-run `npx prisma migrate status` first to see the actual resulting state before taking any further action — Postgres DDL in a single migration file runs inside one transaction by default for `CREATE`/`ALTER` statements of this shape, so a failure should leave the schema exactly as it was before the attempt, but this should always be confirmed rather than assumed.

## Approval Checklist

- [ ] Phase A pre-migration checks re-confirmed immediately before applying
- [ ] Approval given to run `npx prisma migrate deploy` (Phase B)
- [ ] Phase C schema verification passed
- [ ] Approval given to merge `version-7-order-status-audit-model-implementation` into `main` (Phase D)
- [ ] Phase E push completed
- [ ] Phase F GitHub Actions/Render deploy confirmed successful
- [ ] Phase G live verification passed

None of these are checked as part of this document — this is the plan, not the execution.
