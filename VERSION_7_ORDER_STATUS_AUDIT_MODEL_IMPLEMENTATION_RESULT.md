# Version 7, Milestone 62: Order Status Audit Model Implementation — Result

**Schema and migration only. No status-update endpoint, no frontend control, no admin write API, no audit row was written, no order/payment/product/customer data was changed.**

Implements the model designed in `VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md` (Milestone 61), continuing from `VERSION_7_ORDER_STATUS_WORKFLOW_PLAN.md` (Milestone 60).

## What Was Implemented

Added the `OrderStatusHistory` model, its `OrderStatusHistorySource` enum, and the two reverse relations (`Order.statusHistory`, `AdminUser.orderStatusHistory`) to `backend/prisma/schema.prisma`. Generated (not applied) the corresponding migration. **Nothing else in the codebase was touched** — no route, controller, service, or frontend file was created or modified.

## Schema Changes

**New enum** `OrderStatusHistorySource`: `ADMIN_DASHBOARD`, `SYSTEM`, `PAYFAST_ITN`, `MANUAL_DATABASE_LEGACY` — matches Milestone 61's Section 5 exactly. Only `ADMIN_DASHBOARD` is intended for use by the first future write implementation (Milestone 63); the other three are reserved, unused placeholders for now.

**New model** `OrderStatusHistory`:

```prisma
model OrderStatusHistory {
  id      String @id @default(cuid())
  orderId String
  order   Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  orderNumberSnapshot String

  changedByAdminUserId        String?
  changedByAdminUser          AdminUser? @relation(fields: [changedByAdminUserId], references: [id], onDelete: SetNull)
  changedByAdminEmailSnapshot String?
  changedByAdminNameSnapshot  String?

  oldStatus OrderStatus
  newStatus OrderStatus

  note   String?
  source OrderStatusHistorySource

  createdAt DateTime @default(now())

  @@index([orderId, createdAt])
  @@index([orderNumberSnapshot])
  @@index([changedByAdminUserId])
  @@index([source])
  @@index([createdAt])
}
```

**Reverse relations added:**
- `Order.statusHistory OrderStatusHistory[]` — every order gains this relation; empty for every order today (see "Why No Old Orders Were Backfilled" below).
- `AdminUser.orderStatusHistory OrderStatusHistory[]`.

## Migration

**Name:** `20260719095604_add_order_status_history`
**File:** `backend/prisma/migrations/20260719095604_add_order_status_history/migration.sql`

**How it was produced:** `backend/.env`'s `DATABASE_URL` points at the same single, shared Supabase Postgres instance used by both local development and production — confirmed directly before starting this milestone (no separate local/staging database exists for this project, per the established discipline from every prior schema-changing milestone, e.g. Milestone 58's `AdminUser`/`AdminSession` migration). Because of that, `npx prisma migrate dev --name add_order_status_history --create-only` was used specifically for its `--create-only` behaviour: it generates the migration SQL by diffing the schema against the real database, but does **not** apply it. This is the exact same safe pattern already used for every prior migration in this project.

**Confirmed via `npx prisma migrate status`** immediately after creation: the migration shows as pending ("Following migration have not yet been applied: `20260719095604_add_order_status_history`"), not applied.

**Migration contents** (verbatim, reviewed line by line): `CREATE TYPE "OrderStatusHistorySource"`, `CREATE TABLE "OrderStatusHistory"`, five `CREATE INDEX` statements, two `ALTER TABLE ... ADD CONSTRAINT` foreign-key statements (`orderId` → `Order.id` with `ON DELETE CASCADE`, `changedByAdminUserId` → `AdminUser.id` with `ON DELETE SET NULL`). **No `INSERT`, `UPDATE`, or `DELETE` statement anywhere in the file** — purely additive DDL, touching no existing table's data.

## Indexes Added

| Index | Purpose |
|---|---|
| `(orderId, createdAt)` | The primary future query shape — "this order's history, newest first" (the audit timeline on the order detail page). |
| `orderNumberSnapshot` | Lets a future lookup find history by the customer-facing order number directly, without joining through `Order` first. |
| `changedByAdminUserId` | Supports a future "what has this admin changed" view. |
| `source` | Supports filtering/reporting by source once more than one source is ever actually used. |
| `createdAt` | Supports a future global (cross-order) recent-activity view. |

All five from Milestone 61's plan were kept as-is — the table is expected to stay small relative to `Order`/`Product` for a long time, so there was no practical reason to trim this set down for a "simpler" alternative.

## Relation Behaviour

- **`Order` → `OrderStatusHistory`: `Cascade`** (declared on `OrderStatusHistory.order`). If an order is ever deleted, its history is deleted with it — matches the existing pattern already used for `OrderItem`/`Payment`/`Shipping`. This is not encouragement to delete orders; per this project's established discipline, deleting a real order remains exceptional, carefully-reviewed cleanup only.
- **`AdminUser` → `OrderStatusHistory`: `SetNull`** (declared on `OrderStatusHistory.changedByAdminUser`, optional FK). Deleting an admin user leaves every `OrderStatusHistory` row it ever created intact, with `changedByAdminUserId` becoming `null` — the row's `changedByAdminEmailSnapshot`/`changedByAdminNameSnapshot` still say plainly who made the change. This is the opposite of `AdminSession`'s existing `Cascade` relation to `AdminUser`, deliberately: a session has no meaning once its owner is gone, but a historical record of what that owner did must survive them.

## Why No Old Orders Were Backfilled

The 3 orders currently in the database (`SG-2026-28SM`, `SG-2026-UM3Y`, `SG-2026-4DX9`) have **zero** `OrderStatusHistory` rows after this migration, by design — matching Milestone 61 Section 12 exactly. There is no reliable source for "who changed this order's status and when" for any status change that already happened via direct, undocumented database writes; inventing plausible-looking rows would be actively misleading rather than informative. The order detail page must (once a future milestone adds the audit timeline UI) show "No status history recorded yet." for these orders, never a fabricated one. The first genuine status change made through the future admin feature is what creates each order's real first history row.

## Why No Write Route Was Added

This milestone's scope is schema and migration only, per Milestone 60/61's explicit phased plan: plan → audit model plan → **audit model implementation (this milestone)** → status-update backend → status-update frontend. Building the `PATCH /api/admin/orders/:orderNumber/status` endpoint before the table it needs to write to is applied would either fail outright or (worse) tempt writing to it without the audit-transaction safety this whole design exists to guarantee. No route, controller, service, or frontend file was touched — confirmed by `git diff --stat` against `main`, which shows only `backend/prisma/schema.prisma` as a tracked modification, plus the new (untracked-until-committed) migration directory.

## Production Safety Notes

- The shared production database was queried (read-only) before and after this milestone's changes: `Order` (3), `Product` (10), `Payment` (3), `Enquiry` (0), `AdminUser` (1), `AdminSession` (0) — identical throughout.
- All 3 orders' `status`/`paymentStatus` confirmed unchanged (`PENDING`/`PENDING` for every order, same as before this milestone).
- Directly confirmed the `OrderStatusHistory` table **does not exist yet** in the database (`information_schema.tables` query returned zero rows for that name) — proof the migration is genuinely unapplied, not just reported as such.
- No `.env` file was changed. No credential was added. No PayFast or checkout file was touched.

## How Future Milestone 63 Should Use This Model

- Write exactly one `OrderStatusHistory` row per status change, inside the same database transaction as the `Order.status` update itself (Milestone 61 Section 7) — if the audit-row insert fails, the whole transaction (including the status change) must roll back.
- Always populate `orderNumberSnapshot`, `changedByAdminEmailSnapshot`, and `changedByAdminNameSnapshot` from the authenticated admin's session and the order's current `orderNumber` at write time — never leave them null for an `ADMIN_DASHBOARD`-sourced row (they're nullable in the schema specifically to accommodate possible future non-admin sources, not to make them optional for the admin-dashboard path).
- Always set `source: ADMIN_DASHBOARD` for the first implementation — the other three enum values must not be written by any code until their own explicitly-designed future milestone.
- Never write `paymentStatus`, order totals, items, or customer details through this model or the endpoint that uses it — this table only ever records `oldStatus`/`newStatus` on `Order.status`.
- Migration `20260719095604_add_order_status_history` must be applied (via `prisma migrate deploy`, as its own explicit approval step) before Milestone 63's code can run against the real database.

## Testing Results

| Check | Result |
|---|---|
| `npx prisma validate` | `The schema at prisma\schema.prisma is valid` |
| `npx prisma migrate status` | Confirms `20260719095604_add_order_status_history` pending, not applied |
| Backend `npm run build` (`prisma generate && tsc`) | Pass — Prisma Client regenerated with the new `OrderStatusHistory` types; `tsc` compiled the whole existing codebase cleanly against the updated client, confirming nothing existing broke |
| Backend `npm run lint` (`tsc --noEmit`) | Pass |
| Frontend `npm run build` (`vite build`) | Pass (frontend has no dependency on this backend schema change; run as a full regression check regardless) |
| Direct database check: `OrderStatusHistory` table does not exist yet | Confirmed |
| Direct database check: business data + order statuses unchanged | Confirmed |

## Risks or Open Questions

- **`changedByAdminEmailSnapshot`/`changedByAdminNameSnapshot` are nullable in this schema**, matching this milestone's exact field spec — but Milestone 63's implementation must treat them as effectively required for any `ADMIN_DASHBOARD`-sourced row (see "How Future Milestone 63 Should Use This Model" above); the schema itself cannot enforce this, only application code can.
- **`source` remains a real Prisma enum here**, not the free-string alternative Milestone 61 raised as an open question — this was chosen because the task's own field list specified a Prisma enum type (`OrderStatusHistorySource`), and a small, currently-4-value enum is simple to extend with a future migration if a fifth source is ever genuinely needed.
- **Applying this migration to production is a separate, explicit approval step**, not yet requested or performed by this milestone — consistent with this project's established migration-safety discipline (a single shared database, no staging).
- **`PAYFAST_ITN` as a real audit source remains unresolved**, exactly as flagged in Milestone 61 — this schema reserves the enum value but no code writes it, and retrofitting audit logging into `payfast.service.ts`'s existing, already-proven ITN handler stays a distinct future decision.
