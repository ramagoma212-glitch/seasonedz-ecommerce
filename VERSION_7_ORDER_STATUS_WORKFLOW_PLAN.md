# Version 7, Milestone 60: Order Status Update Workflow — Planning

**Planning only. No code was changed except this document. No database write, migration, or admin write route was added. No order, payment, or product data was changed.**

Builds on `VERSION_7_ADMIN_DASHBOARD_PLAN.md` (Milestone 57), `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md` (Milestone 44), `VERSION_6_COURIER_MANUAL_WORKFLOW_RESULT.md` (Milestone 54), and `VERSION_7_READ_ONLY_ADMIN_DASHBOARD_RESULT.md` (Milestone 59).

## 1. Current Order Model and Status Fields

Reviewed directly against `backend/prisma/schema.prisma`, `backend/src/services/order.service.ts`, `backend/src/controllers/order.controller.ts`, `backend/src/routes/order.routes.ts`, `backend/src/services/adminDashboard.service.ts` (the task referenced `backend/src/services/admin/adminDashboard.service.ts` — no `admin/` subfolder exists; the real path has no subfolder, noted here for accuracy), and the frontend admin order pages (`src/pages/adminOrders.js`, `src/pages/adminOrderDetail.js`).

**Three separate status fields already exist on `Order`** (per `backend/DELIVERY_SETUP.md`'s "How Order Status and Fulfilment Status Should Work", unchanged since Milestone 25):

| Field | Enum | Values | Set by today |
|---|---|---|---|
| `Order.status` | `OrderStatus` | `PENDING`, `CONFIRMED`, `PROCESSING`, `READY_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `REFUNDED` | Order creation (`PENDING`); PayFast ITN moves `PENDING` → `CONFIRMED` on a verified `COMPLETE`; everything else is a direct, manual database write today |
| `Order.paymentStatus` | `PaymentStatus` | `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED` | Order creation (`PENDING`); PayFast ITN (`PAID`/`FAILED`/`CANCELLED`); Bank Transfer/Cash on Delivery have no automatic confirmation — manual database write only |
| `Order.fulfilmentStatus` / `Shipping.status` | `FulfilmentStatus` | `NOT_STARTED`, `PACKING`, `READY`, `SHIPPED`, `DELIVERED`, `RETURNED` | Entirely manual, by Seasonedz Group staff, direct database write |

Also present on `Order`: `orderNumber` (unique, customer-facing, e.g. `SG-2026-A1B2`), `paymentMethod` (`BANK_TRANSFER`/`PAYFAST`/`CASH_ON_DELIVERY`/`MANUAL`), customer details denormalised directly on the order (`customerEmail`/`customerPhone`/`customerFirstName`/`customerLastName`), delivery address denormalised directly on the order (`deliveryStreetAddress`/`deliverySuburb`/`deliveryCity`/`deliveryProvince`/`deliveryPostalCode`/`deliveryCountry`/`deliveryNotes`), `subtotal`/`deliveryFee`/`discountTotal`/`total`, an internal `notes` field, `createdAt`/`updatedAt`. Related `Payment` (one per order: `method`, `status`, `amount`, `provider`, `providerReference`, `paidAt`, `failureReason`) and `Shipping` (one per order: `status`, `courierName`, `trackingNumber`, `trackingUrl`, `estimatedDelivery`, `shippedAt`, `deliveredAt`).

**No route exists today to update any of these fields.** `order.routes.ts` has exactly three routes, all customer-facing and none of them writes to an existing order: `POST /` (create), `GET /:orderNumber/tracking`, `GET /:orderNumber`. The Milestone 59 admin dashboard added only `GET` routes (`/api/admin/dashboard`, `/orders`, `/orders/:orderNumber`, `/enquiries`, `/products/low-stock`) — confirmed by re-reading `adminDashboard.routes.ts`, `adminDashboard.controller.ts`, and `adminDashboard.service.ts` line by line: no `.create(`, `.update(`, `.delete(`, or `.upsert(` call exists anywhere in any of them. The frontend admin order pages (`adminOrders.js`, `adminOrderDetail.js`) render tables and cards only — no button exists on either page besides the shared Sign Out button.

**No audit trail exists.** Confirmed — no `AdminActivityLog` or equivalent model exists in `schema.prisma`; `Order.updatedAt` shows only *when* something last changed, never *who* or *what specifically*.

## 2. Current Order Lifecycle (Real, As It Happens Today)

1. Customer places an order via `POST /api/orders` — server-side price/stock verification, stock decremented in a transaction, order created as `status: PENDING`, `paymentStatus: PENDING`.
2. **Bank Transfer**: order can be created; nothing further happens automatically. **PayFast**: currently disabled in production (`PAYFAST_ENABLED=false`) — no PayFast order can actually complete payment today.
3. Admin reviews new/pending orders manually (currently via direct database query/Prisma Studio, or — since Milestone 59 — the new read-only admin dashboard's orders list, which replaces the query but not the manual review itself).
4. For Bank Transfer, payment is confirmed manually: staff check the real business bank account/statement (entirely outside this codebase), then — today — manually write `paymentStatus: PAID` and `status: CONFIRMED` directly to the database (no API route exists for this).
5. Delivery is arranged entirely manually: staff pack the order, choose a courier, book it outside this codebase, and manually write `fulfilmentStatus`/`Shipping` fields once booked.
6. The customer may be contacted by Email or WhatsApp (real contact details already live on the site) for delivery-detail confirmation, tracking updates, or issue handling — no automated customer email exists yet (`EMAIL_ENABLED=false`).

This is unchanged by Milestone 59 — the read-only dashboard makes step 3 easier to see, but steps 4-5 are still raw database writes today.

## 3. Recommended Order Statuses

**Recommendation: use `Order.status` (the existing `OrderStatus` enum) as the single field a future admin status-update workflow writes to — no new enum, no new field.** This also has to stay consistent with the customer-facing Track Order page, which already renders a 6-step tracker straight from these exact enum values (`order.service.ts`'s `TRACKING_STEPS`) — inventing a different status vocabulary for admin would immediately diverge from what customers already see.

| Existing `OrderStatus` value | Plain English | Customer tracking label (already live) |
|---|---|---|
| `PENDING` | Order received, not confirmed yet. | "Order Placed" |
| `CONFIRMED` | Payment or order confirmation accepted. | "Order Confirmed" |
| `PROCESSING` | Order is being prepared. | "Preparing Your Order" |
| `READY_FOR_DELIVERY` | Order is packed and ready for courier. (Task's suggested "PACKED" maps here.) | "Ready for Delivery" |
| `OUT_FOR_DELIVERY` | Courier/delivery has been arranged and the order is in transit. (Task's suggested "SHIPPED" maps here.) | "Out for Delivery" |
| `DELIVERED` | Customer received the order. | "Delivered" |
| `CANCELLED` | Order will not continue. | (not shown in the stepper — communicated separately) |

**`REFUNDED` already exists in the enum but is deliberately excluded from this workflow's allowed transitions.** Per the task's explicit instruction, refund status changes are payment-related, not a simple order-lifecycle step, and should be designed as their own future milestone alongside real refund handling (see `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s "Refund or Issue Handling Process" — refunds today happen entirely outside this codebase, via the bank or the PayFast merchant dashboard). Marking `REFUNDED` here is out of scope until that policy exists.

**No `PACKED`/`SHIPPED` values need inventing** — the task's suggested granularity already exists, just under `OrderStatus.READY_FOR_DELIVERY`/`OUT_FOR_DELIVERY` (customer-facing lifecycle) and, separately, under the existing `FulfilmentStatus` enum's `PACKING`/`READY`/`SHIPPED` (physical fulfilment detail, used on `Order.fulfilmentStatus` and mirrored on `Shipping.status`). See Section 9 for how a future implementation should keep these two dimensions in sync rather than colliding.

## 4. Payment Status Rules

- **Bank Transfer orders start `paymentStatus: PENDING`** at creation — unchanged, no automation exists or is proposed here.
- **`paymentStatus` must not become `PAID` for a Bank Transfer order until a human has verified the real bank transfer arrived** (via the real business bank account/statement, entirely outside this codebase) — this is a process rule today and must remain an explicit, deliberate admin action in any future implementation, never inferred from an order-status change alone.
- **PayFast orders must only ever become `PAID` through a verified backend ITN** (`POST /api/payments/payfast/notify`), exactly as today — once PayFast is re-enabled in the future. **No future admin action should be able to manually set a PayFast order's `paymentStatus` to `PAID`.** If a policy need ever arises for a manual PayFast override (e.g. a proven payment the ITN somehow missed), that must be its own explicitly-designed, heavily-audited feature — not a side effect of the general order-status workflow this milestone plans.
- **A future order-status update endpoint must never touch `paymentStatus`.** Order status (`Order.status`) and payment status (`Order.paymentStatus`) are separate concerns updated through separate, deliberate actions — conflating them risks exactly the kind of silent, unaudited payment-state change this whole plan exists to prevent.
- **Cancelling an order must never automatically refund anything.** Per `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`, refunds happen manually via the bank or PayFast merchant dashboard; a future `CANCELLED` transition should, at most, prompt the admin to remember to handle a refund manually if one is owed — never trigger one.
- **Stock is never automatically restored by a status change.** Today's code decrements stock once at order creation regardless of payment outcome, and nothing in this plan proposes changing that — a cancelled order's stock restoration (if any) stays a separate, manual decision per the existing monitoring plan.

## 5. Allowed Status Transitions (`Order.status`)

| From | Allowed to |
|---|---|
| `PENDING` | `CONFIRMED`, `CANCELLED` |
| `CONFIRMED` | `PROCESSING`, `CANCELLED` |
| `PROCESSING` | `READY_FOR_DELIVERY`, `CANCELLED` |
| `READY_FOR_DELIVERY` | `OUT_FOR_DELIVERY`, `CANCELLED` |
| `OUT_FOR_DELIVERY` | `DELIVERED` |
| `DELIVERED` | *(none — final)* |
| `CANCELLED` | *(none — final)* |

Every non-final status may move to `CANCELLED` (an order can stop at any point before delivery), but `CANCELLED` and `DELIVERED` are both dead ends by design — see Section 12 for how a genuine mistake should be handled instead of allowing a transition out of a final state.

**Blocked transitions (explicit, non-exhaustive examples the future implementation must reject):**
- `DELIVERED` → `PENDING` (or any other status) — blocked, final.
- `CANCELLED` → `DELIVERED` (or any other status) — blocked, final.
- `SHIPPED`-equivalent (`OUT_FOR_DELIVERY`) → `PENDING` — blocked, no backward jump.
- `PENDING` → `DELIVERED` or `OUT_FOR_DELIVERY` — blocked, no skipping ahead.
- Any transition that also changes `paymentStatus` in the same action — blocked; payment status changes are a separate, deliberate action (Section 4).
- Any transition to `REFUNDED` — blocked in this workflow (Section 3).

## 6. Admin Permissions

**For this milestone's future implementation: only an authenticated admin (any row in `AdminUser` that passes `requireAdminAuth`) may update order status — no distinction by role yet.** The `AdminUser.role` field (`ADMIN`/`STAFF`) already exists in the schema but nothing branches on it anywhere in the codebase today (confirmed by grep — `role` is only ever read, never checked, outside of the bootstrap script setting it to `ADMIN`).

**Do not implement roles now.** A future need (e.g. `STAFF` can update fulfilment-only fields, `ADMIN`/`OWNER` can cancel or handle payment-adjacent actions) should be designed deliberately when it's actually needed, not spoken for here. If a future milestone does add role checks, `OWNER`/`ADMIN`/`STAFF` would need to be added to the existing `UserRole` enum (currently just `ADMIN`/`STAFF`) — noted here as a possible future direction, not decided.

## 7. Audit and Safety Requirements

Before any status-update code is written, the following must exist:

- **Who changed the status** — the authenticated admin's id (already available as `req.adminUser.id` via `requireAdminAuth`, proven working since Milestone 58).
- **Old status and new status** — both, not just the new one, so a change is always reconstructable.
- **Timestamp** — when the change happened.
- **Optional note** — free text the admin can attach (e.g. "confirmed via bank statement, ref #1234").
- **Reason for cancellation** — required (not optional) specifically when the new status is `CANCELLED`, since this is the one transition most likely to need a clear paper trail for customer service later.
- **Manual tracking number** — not part of order-status audit itself, but related: `Shipping.trackingNumber` already exists and should continue to be set alongside `fulfilmentStatus`/`Shipping.status` changes (see Section 9), captured the same deliberate way.
- **No silent status changes** — every future write to `Order.status` must go through the audited endpoint; no other code path (a script, a direct database edit outside of documented monitoring exceptions) should be treated as routine once this workflow exists.

No audit table exists yet. **Recommendation: do not allow any status-update code to ship until an audit model exists** (see Section 10) — an unaudited write button would be a regression from today's already-weak (but at least rare and deliberate) direct-database-edit process, not an improvement.

## 8. Future UI Workflow (Planning Only — Not Built)

- The order detail page (`/admin/orders/:orderNumber`, already live and read-only since Milestone 59) should show the current `status` (already does, via the existing status badge) and, once this feature exists, a way to change it.
- The admin should only ever be offered the **valid next statuses** for the order's current status (Section 5's table), never a free-form dropdown of every enum value — this is as much a safety feature as a UX one, since it makes an invalid transition structurally unreachable from the UI, not just rejected server-side.
- Before applying any change, the admin should see a **confirmation prompt** stating old status → new status in plain English.
- The admin should be able to **optionally add a note** (required specifically for `CANCELLED`, per Section 7).
- **`CANCELLED` (and any other status treated as "dangerous" by a future design) should require an extra confirmation step** — e.g. a second "Are you sure?" click, or typing the order number to confirm, matching the level of care this project already applies to other risky actions (see this project's own established pattern of pausing for explicit approval before irreversible steps).
- **No bulk status updates in the first version** — one order, one change, one confirmation, matching the "read-only first, prove it's stable, then add one careful write action at a time" discipline already used for Milestones 58 → 59 → (this planning milestone).
- **No automatic customer email** — until a real email provider is connected (`EMAIL_ENABLED=false` today, see `VERSION_6_EMAIL_SERVICE_PLAN.md`), a status change stays a silent (to the customer) database update; telling the customer remains a manual Email/WhatsApp message, exactly as today.

## 9. Future API Plan (Planning Only — Not Built)

```
PATCH /api/admin/orders/:orderNumber/status
```

**Request body:**
```json
{ "newStatus": "CONFIRMED", "note": "optional free text" }
```

**Rules for the future implementation:**
- Must require `requireAdminAuth` (same middleware already proven since Milestone 58; mounted the same router-level way `adminDashboard.routes.ts` already does, not a per-handler check).
- Must validate the requested transition against Section 5's table — reject with a clear `400` (not the more generic `500`) for any disallowed transition, including a same-status "transition" (e.g. `PENDING` → `PENDING`) unless deliberately decided otherwise.
- Must require `note` when `newStatus` is `CANCELLED` (Section 7).
- **Must not update `paymentStatus`** — a completely separate action (Section 4).
- **Must not change order totals** (`subtotal`/`deliveryFee`/`discountTotal`/`total`) — this endpoint only ever touches `status`.
- **Must not change `items`** (`OrderItem` rows) — never touched by a status update.
- **Must not change customer details** (name/email/phone) or delivery address — never touched by a status update.
- Must create an audit entry (Section 10) in the same transaction as the status write — the write and its audit record must succeed or fail together, never one without the other.
- Must return the updated order summary (reusing the existing `order.service.ts` `OrderOutput` shape the admin order-detail page already renders, so the frontend can update in place without a second fetch).

**This route is not implemented by this milestone.** No file under `backend/src/routes/`, `backend/src/controllers/`, or `backend/src/services/` was created or modified for it.

## 10. Future Database/Audit Plan (Planning Only — Not Built)

Proposed `OrderStatusHistory` model (name chosen to match this project's existing `PascalCase` singular-noun model-naming convention):

```prisma
model OrderStatusHistory {
  id                  String   @id @default(cuid())
  orderId             String
  order               Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  changedByAdminUserId String
  changedByAdminUser  AdminUser @relation(fields: [changedByAdminUserId], references: [id])
  oldStatus           OrderStatus
  newStatus           OrderStatus
  note                String?
  createdAt           DateTime @default(now())

  @@index([orderId])
  @@index([changedByAdminUserId])
}
```

Matches this project's already-established patterns: `onDelete: Cascade` from the child side (same as `AdminSession` → `AdminUser`, `OrderItem` → `Order`), an index on the foreign key columns that will actually be queried, `cuid()` ids, `createdAt` only (no `updatedAt` — a history row is never edited after creation, by design, matching the "no silent status changes" requirement in Section 7).

**Not created by this milestone.** No change was made to `backend/prisma/schema.prisma`. **No migration was generated or applied.** Per this project's established migration-safety discipline (a single shared production database, no separate staging — see `VERSION_7_ADMIN_AUTH_DEPLOYMENT_BOOTSTRAP_PLAN.md`'s migration section), creating this model should follow the same "prepare via `migrate dev --create-only`, apply only as an explicit separate approval step" pattern already used for the `AdminUser`/`AdminSession` migration in Milestone 58 — recommended as its own future milestone (61, see Section 14), not bundled into the same milestone that writes the status-update code.

## 11. Customer Communication (Future, Not Built)

- Status-update emails or WhatsApp messages are explicitly **future work**, dependent on `VERSION_6_EMAIL_SERVICE_PLAN.md`'s email provider being connected (`EMAIL_ENABLED` stays `false` until then).
- **No real email is sent by this milestone or its future implementation phase**, unless a later, explicitly-approved milestone connects a real provider first.
- **No automatic WhatsApp message** is sent by any part of this plan — WhatsApp contact stays a manual, human-initiated channel, exactly as today.
- When email does exist, a status-change notification is a natural candidate for its first real transactional email — but that decision belongs to the email-provider milestone, not this one.

## 12. Rollback and Mistake Handling

- **Use the audit trail (Section 10)** as the source of truth for "what did this order's status used to be" — never rely on memory or `updatedAt` alone.
- **Allow correction only for non-final statuses.** If an admin mis-clicks `PENDING → CONFIRMED` and it should have been `PENDING → CANCELLED`, correcting it is just another forward transition (`CONFIRMED → CANCELLED`, already allowed per Section 5) — no special "undo" mechanism is needed for non-final mistakes.
- **Final statuses (`DELIVERED`, `CANCELLED`) require careful policy, not a quick fix.** Since Section 5 deliberately blocks any transition out of a final status, a genuine mistake here (e.g. marking the wrong order `DELIVERED`) should **not** be solved by silently allowing a backward transition in code — that would defeat the whole point of making final states final. Instead, this should be a documented manual escalation (e.g. a deliberate, individually-reviewed direct correction with its own audit note explaining it was a correction, following the same care this project already applies to any direct-database intervention) — a policy decision for whoever operates this, not something this plan resolves by loosening the transition table.
- **Never delete order history.** `OrderStatusHistory` rows (once they exist) are never deleted, edited, or hidden — a mistake becomes another row in the history (the correction), not an erased one.
- **Never delete orders to fix a status mistake.** Exactly the same discipline already established project-wide for cleanup of any kind (see every Version 4/5 milestone's cleanup sections) — a wrong status is a data-correctness problem to fix forward, never a reason to delete the order itself.

## 13. Risks

- **Building the write endpoint before the audit model exists** would ship a regression (an unaudited status change) rather than an improvement over today's manual process — Section 7's recommendation (audit model first) exists specifically to prevent this ordering mistake.
- **Two status dimensions (`Order.status` vs. `Order.fulfilmentStatus`/`Shipping.status`) can drift** if a future implementation updates one without the other — e.g. `Order.status` says `OUT_FOR_DELIVERY` but `Shipping.status` is still `NOT_STARTED`. The future implementation milestone must explicitly decide whether/how these two fields stay coordinated (e.g. certain `Order.status` transitions automatically set a corresponding `fulfilmentStatus`), a decision this planning milestone deliberately leaves open rather than guessing.
- **Conflating order-status and payment-status changes** into one action is the single biggest risk this plan guards against (Section 4) — a future implementation must resist the temptation to "just add a paymentStatus field to the same PATCH" for convenience.
- **A missing transition-validation bug** (e.g. accepting `DELIVERED → PENDING` due to a coding mistake) would be far more damaging with no audit trail to catch and explain it — another reason the audit model (Section 10) should exist before the write endpoint (Section 9), not after.
- **Role-less admin access** means any authenticated admin can change any order's status today's plan describes — acceptable for a single-admin/small-team operation now (matches Milestone 58's "one or a handful of staff accounts" framing), but worth revisiting if the team grows (Section 6).

## 14. Recommended Next Milestones

1. **Milestone 60** — Order status update workflow planning (this milestone).
2. **Milestone 61** — Order status audit model planning: concrete schema design review, migration preparation (`--create-only`, not applied), and explicit sign-off on the `OrderStatusHistory` shape from Section 10 — planning/schema-prep only, same spirit as this milestone.
3. **Milestone 62** — Order status update backend implementation: the actual `PATCH /api/admin/orders/:orderNumber/status` route (Section 9), transition validation (Section 5), audit-entry creation (Section 10), only after Milestone 61's migration is applied as its own explicit approval step.
4. **Milestone 63** — Order status update frontend implementation: the admin order-detail page gains the status-change control (Section 8), only after Milestone 62 is live and independently tested.
5. **Milestone 64** — Admin enquiries management: status updates (`NEW`/`IN_REVIEW`/`RESPONDED`/`CLOSED`) for `Enquiry`, following the exact same "plan → audit → backend → frontend" phased discipline this document establishes for orders.
6. **Milestone 65** — Admin product stock view and stock notes: read-only detail beyond the Milestone 59 low-stock list, plus a non-destructive way to leave a stock note (still no product add/edit).
7. **Milestone 66** — Product add and edit planning: concrete field list, validation rules, image-upload storage decision — planning only, per `VERSION_7_ADMIN_DASHBOARD_PLAN.md`'s existing "Future Product Add and Edit Plan" section.

## 15. Safety Confirmation

- No code files were changed — only this document was created.
- No database schema was changed — `backend/prisma/schema.prisma` untouched.
- No migration was created or applied.
- No production data was changed.
- No order status was changed.
- No payment status was changed.
- No admin write route was added — `backend/src/routes/adminDashboard.routes.ts` and every other route file remain exactly as they were after Milestone 59.
- No update button was added to any frontend page.
- No PayFast changes — untouched.
- No checkout changes — untouched.
- No `.env` file changed.
- No credentials added.
- No real email was sent.
- No test order was created.
