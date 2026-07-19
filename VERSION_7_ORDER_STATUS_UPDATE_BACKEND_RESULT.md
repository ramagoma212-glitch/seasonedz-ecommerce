# Version 7, Milestone 63: Order Status Update Backend — Result

**Backend implementation only. No frontend control was added. No production order, payment, product, or customer data was changed. No authenticated mutation was run against the shared database.**

Implements the route designed in `VERSION_7_ORDER_STATUS_WORKFLOW_PLAN.md` (Milestone 60) and `VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md` (Milestone 61), against the `OrderStatusHistory` table added in `VERSION_7_ORDER_STATUS_AUDIT_MODEL_IMPLEMENTATION_RESULT.md` (Milestone 62, already live in production, empty).

## What Was Implemented

The first write action ever added to the admin dashboard (Milestones 58-62 were entirely read-only): `PATCH /api/admin/orders/:orderNumber/status`, protected by `requireAdminAuth`, validating and applying only order-status transitions, writing exactly one audit row per change, inside a single database transaction.

## Route Added

```
PATCH /api/admin/orders/:orderNumber/status
```

Mounted in the existing `backend/src/routes/adminDashboard.routes.ts`, inheriting `requireAdminAuth` from the router-level `router.use(requireAdminAuth)` already applied there since Milestone 59 — no per-handler auth check needed or added.

**Request body:** `{ "newStatus": "CONFIRMED", "note": "optional, required for CANCELLED" }`

## Files Created

- `backend/src/services/adminOrderStatus.service.ts` — the transition table, all validation, and the audited transaction. Deliberately its own file, separate from `adminDashboard.service.ts` (which stays 100% read queries), so the one place in the codebase that writes `Order.status` is easy to find and review in isolation.
- `backend/src/controllers/adminOrderStatus.controller.ts` — the one write handler, separate from `adminDashboard.controller.ts` for the same reason.

## Files Modified

- `backend/src/routes/adminDashboard.routes.ts` — one new line (`router.patch("/orders/:orderNumber/status", updateOrderStatusHandler)`) plus an updated file-level comment reflecting that this router now has exactly one write route.

**No other file was touched.** No frontend file, no `order.service.ts`, no `payment` file, no `PayFast` file, no `.env` file.

## Validation Rules Implemented

In order, matching the task's exact rule list:

1. Order existence — looked up by `orderNumber` inside the transaction; `404` if not found.
2. `newStatus` must be a real `OrderStatus` enum value — `400` otherwise.
3. The requested transition must appear in the allowed-transition table for the order's *current* status — `400` otherwise.
4. `note` is required (non-empty after trim) when `newStatus` is `CANCELLED` — `400` otherwise.
5. `note` is trimmed before validation and storage.
6. `note` is capped at 500 characters — `400` if exceeded.
7. `note` is never treated as HTML anywhere in this backend — stored and returned as plain text; the future frontend (Milestone 64) must escape it before display, matching this project's existing `escapeHtml()` discipline used everywhere else.
8. Nothing in this code path ever needs a password, hash, payment secret, card number, or bank detail — documented as a process rule in the code (this cannot be mechanically enforced against free-text input, only avoided by design).

## Allowed Transitions Implemented

```ts
PENDING            → CONFIRMED, CANCELLED
CONFIRMED          → PROCESSING, CANCELLED
PROCESSING         → READY_FOR_DELIVERY, CANCELLED
READY_FOR_DELIVERY → OUT_FOR_DELIVERY, CANCELLED
OUT_FOR_DELIVERY   → DELIVERED
DELIVERED          → (none — final)
CANCELLED          → (none — final)
REFUNDED           → (none — never a valid newStatus target from any state, and never has outgoing transitions either)
```

Implemented as a `Record<OrderStatus, OrderStatus[]>` — TypeScript enforces every enum member has an entry, so `REFUNDED` is explicitly mapped to an empty array rather than silently omitted, matching Milestone 60's decision to keep refunds entirely out of this workflow. Blocked transitions (`DELIVERED`/`CANCELLED` to anywhere, any backward jump, any unknown status) are rejected simply because they never appear in any "from" state's allowed list — no separate blocklist was needed.

## Audit Behaviour

Every successful call creates **exactly one** `OrderStatusHistory` row:
- `source: ADMIN_DASHBOARD` — hardcoded, never accepts a caller-supplied value.
- `orderNumberSnapshot` — copied from the order's own `orderNumber` at write time.
- `changedByAdminUserId`, `changedByAdminEmailSnapshot`, `changedByAdminNameSnapshot` — all populated from `req.adminUser` (the authenticated admin's session), never from the request body.
- `oldStatus` — the order's status as read at the start of the transaction (before the update).
- `newStatus` — the validated target status.
- `note` — trimmed, or `null` if empty.
- `createdAt` — database default (`now()`), not application-supplied.

## Transaction Behaviour

The entire operation (`tx.order.findUnique` → validate → `tx.order.update` → `tx.orderStatusHistory.create`) runs inside one `prisma.$transaction(async (tx) => { ... })` interactive transaction. **If the audit-row insert fails for any reason, Prisma rolls the whole transaction back — the status write is undone with it.** This was not just asserted but is a direct structural consequence of using one interactive transaction for both writes — there is no code path where `Order.status` changes without a matching `OrderStatusHistory` row being committed in the same database transaction.

## Payment Safety

- The `Order.update` call's `data` object is `{ status: newStatus }` — nothing else. Confirmed by direct code inspection: this is the only `data:` write block touching `Order` anywhere in the new files.
- `paymentStatus` appears elsewhere in the file only in `select`/read/output contexts — confirmed by grep — never inside a write `data` object.
- No `Payment` model, `Shipping` model, `OrderItem` model, or `Customer`/delivery-address field is referenced anywhere in either new file — confirmed by listing every `prisma.`/`tx.` call in both files (exactly 4: one `order.findUnique`, one `order.update`, one `orderStatusHistory.create`, plus the `$transaction` wrapper itself).
- No email is sent — no import of any email service, no reference to `EMAIL_ENABLED`, anywhere in the new code.
- No PayFast file was touched — confirmed via diff.

## What Was Not Implemented

- **No frontend control.** No button, form, or admin-page change of any kind — `src/` is entirely untouched by this milestone (confirmed by `git diff --name-only`, zero `src/` paths).
- **`statusHistory` was deliberately not added to the read-only order-detail response.** `order.service.ts`'s `getOrderByNumber()` is shared by *both* the admin order-detail view (`adminDashboard.controller.ts`) *and* the public, unauthenticated, order-number-gated customer-facing lookup (`order.controller.ts`'s `getOrderHandler`). Adding admin-only audit data (who changed what, an admin's name/email) to that shared function's output would leak it to any customer who knows an order number — a real privacy issue, not just scope creep. This is deferred to Milestone 64, which should instead either build a dedicated admin-only enrichment step (assembled in the admin controller layer, never touching the shared `OrderOutput` shape) or a separate endpoint — not a change to the shared function.
- No product add/edit, no delete action, no enquiry status update — unchanged, out of scope.
- No courier integration, no automatic customer email — unchanged, out of scope, matching the project-wide `EMAIL_ENABLED=false` state.

## Testing Completed

| Check | Result |
|---|---|
| Backend `npm run build` (`prisma generate && tsc`) | Pass |
| Backend `npm run lint` (`tsc --noEmit`) | Pass |
| `npx prisma validate` | `The schema at prisma\schema.prisma is valid` |
| Frontend `npm run build` | Pass (regression check — no frontend code touched, run anyway) |
| Unauthenticated `PATCH .../status` with a valid body | `401 "Authentication required."` |
| Unauthenticated `PATCH .../status` with an invalid `newStatus` value | `401` (rejected by auth middleware before ever reaching validation logic) |
| Unauthenticated `PATCH .../status` on a nonexistent order number | `401` (rejected before any database lookup — `requireAdminAuth` checks the cookie before touching the DB, same design proven in Milestone 58) |
| Unauthenticated `PATCH .../status` with an empty body | `401` |
| Regression: existing read-only admin routes (`/dashboard`, `/orders`, `/orders/:orderNumber`, `/enquiries`, `/products/low-stock`) still return `401` unauthenticated | Pass — no route's behaviour changed |
| Static grep: no `paymentStatus` write anywhere in the new files | Confirmed — only appears in `select`/output contexts |
| Static grep: no frontend file touched | Confirmed — `git diff --name-only` shows zero `src/` paths |
| Database state before vs. after all local testing | Identical — `Order` row count (3), every order's `status`/`paymentStatus`/`updatedAt` byte-for-byte unchanged, `OrderStatusHistory` row count still 0 |

## Why No Authenticated Mutation Test Was Run Against Production Data

This milestone's task explicitly withheld approval for that: *"Do not run authenticated status update tests against production data unless separately approved."* Since this project has only one shared database (no separate staging environment — the same discipline that has governed every migration in this project), there is no way to run a real authenticated `PATCH` request without it hitting the actual production `Order`/`OrderStatusHistory` tables. Testing was therefore limited to what's safe without authentication (the unauthenticated-rejection paths above) and static code review (transaction structure, transition table, write scope) — both of which give strong confidence in correctness without touching real order data. A first authenticated test, ideally against a real order with the owner's own knowledge and approval of exactly which order and which transition, should be its own explicitly-approved next step.

## Next Milestone Recommendation

Milestone 64 — order status update frontend implementation: the admin order-detail page gains a next-valid-statuses-only control, a confirmation modal, and a read-only audit-history timeline (per `VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md` Sections 10-11) — built only after this backend route has been exercised with at least one explicitly-approved authenticated test against a real (or deliberately chosen) order, confirming the whole transaction/audit chain works end-to-end in practice, not just in code review.
