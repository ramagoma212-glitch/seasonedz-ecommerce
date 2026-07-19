# Version 7, Milestone 61: Order Status Audit Model — Planning

**Planning only. No schema change, no migration, no database write, no admin write API, no code change of any kind — only this document was added.**

Builds on `VERSION_7_ORDER_STATUS_WORKFLOW_PLAN.md` (Milestone 60, which first proposed an `OrderStatusHistory` model and flagged the `Order.status`/`Order.fulfilmentStatus` drift risk this document resolves) and `VERSION_7_READ_ONLY_ADMIN_DASHBOARD_RESULT.md` (Milestone 59).

## 1. Current Schema Findings

Reviewed directly against `backend/prisma/schema.prisma` (current, unchanged), `backend/src/routes/adminDashboard.routes.ts`, `backend/src/services/order.service.ts`, and `backend/src/services/payfast.service.ts`. (The task referenced `backend/src/services/admin/adminDashboard.service.ts` — no `admin/` subfolder exists in this project; the real path, confirmed by directory listing, is `backend/src/services/adminDashboard.service.ts`, noted here for accuracy as in Milestone 60's plan.)

**`Order` model fields** (`schema.prisma:248-291`): `id`, `orderNumber` (unique), `customerId` (optional, nullable FK to `Customer`), `customerEmail`/`customerPhone`/`customerFirstName`/`customerLastName` (denormalised directly on the order), full delivery address denormalised directly on the order, `status: OrderStatus` (default `PENDING`), `paymentStatus: PaymentStatus` (default `PENDING`), `fulfilmentStatus: FulfilmentStatus` (default `NOT_STARTED`), `paymentMethod: PaymentMethod`, `subtotal`/`deliveryFee`/`discountTotal`/`total`, internal `notes` (admin-only, never customer-facing), `items`/`payment`/`shipping` relations, `createdAt`/`updatedAt`.

**`OrderStatus` enum**: `PENDING`, `CONFIRMED`, `PROCESSING`, `READY_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `REFUNDED`.

**`PaymentStatus` enum**: `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED`.

**`FulfilmentStatus` enum**: `NOT_STARTED`, `PACKING`, `READY`, `SHIPPED`, `DELIVERED`, `RETURNED` — used by both `Order.fulfilmentStatus` and, separately, `Shipping.status`.

**`Shipping` model** (`schema.prisma:350-365`): one-per-order (`orderId @unique`), `status: FulfilmentStatus` (default `NOT_STARTED`), `courierName`/`trackingNumber`/`trackingUrl`/`estimatedDelivery`/`shippedAt`/`deliveredAt`, `createdAt`/`updatedAt`. Cascade-deletes with its parent `Order`.

**`AdminUser` model** (`schema.prisma:414-427`): `id`, `name`, `email` (unique), `passwordHash`, `role: UserRole` (`ADMIN`/`STAFF`, default `STAFF`), `isActive` (default `true`), `lastLoginAt`, `sessions` relation, `createdAt`/`updatedAt`. No row is ever created except via the manual bootstrap script.

**`AdminSession` model** (`schema.prisma:437-448`): `id`, `adminUserId` (FK, `onDelete: Cascade` — a session is deleted if its admin user is deleted), `tokenHash` (unique), `expiresAt`, `createdAt`, `lastUsedAt`.

**No existing audit or history model of any kind.** Confirmed by reading the full schema file top to bottom — no `OrderStatusHistory`, no `AdminActivityLog`, nothing tracking who changed what.

### Drift risk fields, examined directly

- **`Order.status`** — today, changed automatically in exactly one place in the entire codebase: `payfast.service.ts`'s verified-ITN handler (line 442), which writes `{ paymentStatus: PaymentStatus.PAID, status: OrderStatus.CONFIRMED }` together, in a single `prisma.order.update()` call, only after signature/merchant/amount verification. This is the only non-manual `Order.status` write today; every other status value change happens as a direct, undocumented database write (per `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`).
- **`Order.fulfilmentStatus`** — never written by any code path today; changed only by direct manual database edit, per `backend/DELIVERY_SETUP.md`.
- **`Shipping.status`** — same as `fulfilmentStatus`: manual only, never written by any route or service.
- **`Order.paymentStatus`** — written automatically only by the same verified-ITN handler (`PAID`/`FAILED`/`CANCELLED`); otherwise manual, exactly as documented in Milestone 60's plan.

This confirms Milestone 60's drift-risk flag is real and already partially demonstrated: PayFast's ITN handler is proof that `status` and `paymentStatus` can already move together in one atomic write when done correctly, but `fulfilmentStatus`/`Shipping.status` have no such coordinated write anywhere — they're the two fields most likely to silently drift once an admin order-status feature exists, addressed in Section 8.

## 2. Audit Purpose

The future `OrderStatusHistory` model must, for every future admin order-status change, answer:

- **Who** changed it — the admin's identity.
- **Which order** — unambiguously, even if the order is later modified in unrelated ways.
- **Old status** and **new status** — both, always.
- **When** — an exact timestamp.
- **Why / note** — free text the admin optionally (or, for cancellation, mandatorily) attaches.
- **Where the change came from** — a `source` value distinguishing an admin-dashboard click from any future automated path.
- **Whether it was manual admin action or a future system action** — same purpose as `source`, explicit enough that a future automated status change (should one ever be built) is never confused with a human decision.

## 3. Recommended `OrderStatusHistory` Model

```prisma
model OrderStatusHistory {
  id      String @id @default(cuid())
  orderId String
  order   Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)

  // Snapshot, not just a live join — see Section 4 for why.
  orderNumberSnapshot String

  changedByAdminUserId    String?
  changedByAdminUser      AdminUser? @relation(fields: [changedByAdminUserId], references: [id], onDelete: SetNull)
  changedByAdminEmailSnapshot String
  changedByAdminNameSnapshot  String

  oldStatus OrderStatus
  newStatus OrderStatus

  note   String?
  source String // "ADMIN_DASHBOARD" | "SYSTEM" | "PAYFAST_ITN" | "MANUAL_DATABASE_LEGACY" — see Section 5

  createdAt DateTime @default(now())

  @@index([orderId])
  @@index([changedByAdminUserId])
  @@index([createdAt])
}
```

(`source` is modelled here as a plain `String` rather than a new Prisma `enum` — deliberately, since Section 5's four values include `MANUAL_DATABASE_LEGACY`, a label for rows that were never really written by this system at all (see Section 12); a free-form-but-validated string is easier to extend later than an enum that would need a migration for every new source. This is a design recommendation for the future implementation milestone to confirm, not a decision locked in by this planning document.)

**Should `changedByAdminUserId` be optional?** **Yes — `String?`, not `String`.** Reasoning:

- If an `AdminUser` row is ever deleted (not deactivated — deactivation via `isActive: false` already preserves the row), a `NOT NULL` foreign key would force either blocking that deletion forever or cascading the deletion into audit history — both wrong. Making it optional, combined with `onDelete: SetNull` (Section 4), means the FK cleanly becomes `null` on deletion while the row itself, and its `changedByAdminEmailSnapshot`/`changedByAdminNameSnapshot`, survive intact.
- **Audit history must not disappear if an admin user is later deleted or deactivated.** This is the whole point of the email/name snapshot fields: even with `changedByAdminUserId` set to `null` after a deletion, the audit row still plainly says who made the change, in text that can never be invalidated by a later account change.

## 4. Relation Behaviour

| Relation | Recommended `onDelete` | Reasoning |
|---|---|---|
| `Order` → `OrderStatusHistory` | `Cascade` (from the child side, i.e. `OrderStatusHistory.order` has `onDelete: Cascade`) | If an order is ever deleted, its status history has no meaning without it — matches the existing pattern already used for `OrderItem`/`Payment`/`Shipping` → `Order`. **This should not be read as encouragement to delete orders** — per Section 12 and this project's established discipline (`VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`: "never delete real customer orders"), deleting an order is not normal business behaviour and should stay exceptional, carefully-reviewed cleanup only. |
| `AdminUser` → `OrderStatusHistory` | `SetNull` (optional FK, per Section 3) | Deleting an admin user must **preserve** audit history — the FK becomes `null`, the row (with its email/name snapshot) stays exactly as it was. This is the opposite of `AdminSession`'s existing `onDelete: Cascade` relation to `AdminUser` deliberately: a session has no meaning once its owner is gone, but a historical record of what that owner *did* absolutely does. |

## 5. Source Values

Plan a `source` field (string, validated against a known set in application code — see Section 3's rationale for not making it a Prisma enum yet):

| Value | Meaning | First implementation may write it? |
|---|---|---|
| `ADMIN_DASHBOARD` | A human admin used the future order-status UI. | **Yes — the only value the first implementation (Milestone 63) may ever write.** |
| `SYSTEM` | A future automated process (not yet designed) changed the status without direct human action. | No — reserved for a future milestone that doesn't exist yet. |
| `PAYFAST_ITN` | A verified PayFast ITN moved `Order.status`/`paymentStatus` together (the one automatic path that already exists today, per Section 1). | No — retrofitting audit logging into `payfast.service.ts`'s existing ITN handler is out of scope for this planning milestone and the immediately-following implementation milestone; it is a distinct future integration task, listed as a risk in Section 15, not assumed solved here. |
| `MANUAL_DATABASE_LEGACY` | A label for rows created to document/backfill known-but-unaudited historical direct-database changes, if such backfilling is ever explicitly approved. | No — see Section 12: backfilling is explicitly not recommended by default. |

## 6. Note Rules

- **Optional** for a normal (non-cancellation) transition.
- **Required** when `newStatus` is `CANCELLED` — matches Milestone 60's Section 7 requirement exactly.
- **Maximum length: 500 characters** — generous enough for a real explanation, short enough to stay a note rather than becoming a second `Order.notes` field.
- **Trimmed** of leading/trailing whitespace before validation and storage (matching this project's existing `parseStringParam`-style convention in `backend/src/utils/query.ts`).
- **Never rendered as HTML** — displayed as plain, escaped text in the admin UI (matching this project's existing `escapeHtml()` discipline, already used everywhere user-influenced text reaches the DOM, e.g. `adminOrderDetail.js`, `adminEnquiries.js`).
- **Must never contain passwords, payment secrets, or card details** — this is a process/documentation rule for whoever writes a note (the field is free text, so this cannot be mechanically enforced beyond documentation and admin training), reinforced by the fact that nothing about the order-status workflow ever needs that information in the first place — no future implementation should ever pass anything resembling a secret into this field.

## 7. Transition Validation and Audit Transaction

The future implementation (Milestone 63) must perform the whole status-update operation as **one database transaction** (`prisma.$transaction`, the same pattern already used in `order.service.ts`'s `createOrder()`):

1. Read the current order (row lock/fresh read inside the transaction, not a stale value from an earlier request).
2. Validate the requested transition against Milestone 60's allowed-transition table.
3. Create the `OrderStatusHistory` row (old status, new status, admin identity + snapshot, note, source `ADMIN_DASHBOARD`).
4. Update `Order.status`.
5. Return the updated order summary (reusing `order.service.ts`'s existing `OrderOutput` shape, per Milestone 60 Section 9).

**If the audit-row creation fails, the whole transaction must roll back — the status update must fail too.** This is the entire reason a transaction is required rather than two separate writes: an audit row and a status change must succeed or fail together, so "no silent status changes" (Milestone 60, Section 7) is a structural guarantee, not just a convention someone might forget to follow.

## 8. Status Coordination Recommendation (Resolving Milestone 60's Flagged Risk)

Milestone 60 explicitly left open how `Order.status` and `Order.fulfilmentStatus`/`Shipping.status` should stay coordinated. Evaluated against the actual current schema and the actual current customer-facing tracking code (`order.service.ts`'s `TRACKING_STEPS`, which drives the live Track Order page):

- **`TRACKING_STEPS` is built entirely from `Order.status` values** (`PENDING`/`CONFIRMED`/`PROCESSING`/`READY_FOR_DELIVERY`/`OUT_FOR_DELIVERY`/`DELIVERED`) — it does not read `fulfilmentStatus` or `Shipping.status` at all today. This is a concrete, load-bearing fact, not a guess: the customer-facing feature that already exists and is already live only cares about `Order.status`.
- **No code anywhere reads `fulfilmentStatus`/`Shipping.status` to drive customer-facing behaviour today** — confirmed by the same review that produced Section 1's findings. These fields exist in the schema and are documented as the intended target for manual courier-process updates (`backend/DELIVERY_SETUP.md`), but nothing consumes them programmatically yet.

**Recommendation: Option A.** `Order.status` is the customer-facing status source of truth, and remains what the future admin order-status workflow (Milestone 63) writes to. `Shipping.status`/`Order.fulfilmentStatus` stay secondary, manually-maintained fields, unchanged by the order-status workflow, updated later only once real courier integration exists (per `VERSION_6_COURIER_INTEGRATION_PLAN.md`'s own phased plan) or as its own deliberate, separately-scoped admin feature.

**Why not Option B** (update both together via a mapping): this would require deciding, right now, a firm mapping between two enums that don't share the same shape (`OrderStatus` has 8 values including `CANCELLED`/`REFUNDED`; `FulfilmentStatus` has 6, including `RETURNED`, with no `CANCELLED` equivalent at all) — exactly the kind of guess the task instructs against. Option A defers that mapping decision to whenever real courier integration is actually designed, when the requirements will be concrete rather than assumed.

**Why not treat `paymentStatus` the same as the others** (Option C, already effectively decided in Milestone 60 Section 4 and restated here for completeness): `paymentStatus` stays completely untouched by the order-status workflow, full stop — the one existing counter-example (PayFast's ITN handler) is a verified, security-reviewed, narrowly-scoped exception, not a precedent for a general-purpose admin action to follow.

## 9. Future API Plan (Restating and Extending Milestone 60's Plan)

```
PATCH /api/admin/orders/:orderNumber/status
```

**Request:** `{ "newStatus": "CONFIRMED", "note": "optional, required for CANCELLED" }`

**Response:** updated order summary (existing `OrderOutput` shape) **plus the latest `OrderStatusHistory` entry**, so the frontend can render the new timeline row without a second request.

**Security, restated with this milestone's additions:**
- `requireAdminAuth`, router-level, exactly as `adminDashboard.routes.ts` already does.
- Validate the next status against the allowed-transition table (Milestone 60, Section 5) — reject any other value with `400`.
- Validate the note: required + non-empty (after trim) when `newStatus` is `CANCELLED`; max 500 characters always (Section 6).
- **Never update `paymentStatus`.**
- **Never update order totals.**
- **Never update items.**
- **Never update customer details or delivery address.**
- **Never update `Payment` records.**
- **Never send an automatic customer email in this first version** — matches Milestone 60 Section 11 and the project-wide `EMAIL_ENABLED=false` state.

**Not implemented by this milestone.**

## 10. Future UI Plan (Restating and Extending Milestone 60's Plan)

The admin order-detail page (`/admin/orders/:orderNumber`, live and read-only since Milestone 59) should, once this feature exists:

- Show the current status (already does).
- Offer **only the valid next statuses** as options — never a free dropdown of all 8 `OrderStatus` values.
- Show a **confirmation modal** before applying any change (old → new, in plain English).
- Offer an **optional note field**, becoming **required** the moment `CANCELLED` is selected (client-side hint, still enforced server-side regardless).
- Treat `CANCELLED` as a **dangerous action requiring extra confirmation**, per Milestone 60 Section 8.
- Show the **audit history timeline** (Section 11).
- **No bulk status update** in this first version.
- **No hidden automatic payment change** — the UI must never imply that changing order status also confirms payment; those stay visibly separate concerns on the page.
- **No automatic customer email** yet.

## 11. Audit Timeline Display Plan

A read-only, reverse-chronological list on the order detail page, each row showing:

- **Date and time** (formatted the same way the rest of the admin dashboard already formats timestamps, per `src/js/adminFormat.js`'s `formatDateTime()`).
- **Old status → New status** (rendered with the same `renderStatusBadge()` component already used everywhere else in the admin dashboard, for visual consistency).
- **Changed by** — the admin's name/email (from the snapshot fields, so this stays accurate even if that admin account is later deleted).
- **Source** — shown plainly (e.g. "Admin Dashboard"), mainly to make a future non-dashboard source (if one is ever built) visibly distinct rather than confused with a human decision.
- **Note** — shown if present, escaped, never rendered as HTML (Section 6).

**If no audit history exists for an order** (every order created before this feature ships — see Section 12): show a plain, honest message — **"No status history recorded yet."** — never a fabricated or backfilled row.

## 12. Old Orders Handling

All 3 current orders in the production database predate any audit model. For them, and any other order that already exists by the time this feature ships:

- **Do not create fake audit rows.** There is no reliable source for "who changed this order's status and when" for changes that already happened via direct, undocumented database writes — inventing plausible-looking history would be actively misleading, worse than admitting the gap.
- **Do not guess old history.** Same reasoning — a guessed `changedByAdminUserId`/timestamp is indistinguishable from a real one once stored, which is precisely the failure mode an audit trail exists to prevent.
- **The first future admin status change on an existing order creates that order's first real `OrderStatusHistory` row** — from that point forward, the order has a genuine, trustworthy trail; before that point, it simply has none, and the UI says so plainly (Section 11).
- **The order detail page must still show the current status even when history is empty** — already true today (Milestone 59's read-only detail page), and must remain true once this feature ships; an empty history list is not an error state.

## 13. Privacy and Security Rules

`OrderStatusHistory` must **never** store:

- Passwords or `passwordHash`.
- `tokenHash` or any session-token-shaped value.
- Payment secrets (PayFast merchant key/passphrase, or any provider credential).
- Card details (this project never handles raw card numbers anywhere — PayFast is a redirect-based integration — but stated explicitly here as a hard boundary regardless).
- Raw PayFast ITN payloads.
- Full bank account information.
- Unnecessary customer private data — the model has no reason to duplicate `Order.customerEmail`/delivery address/etc.; `orderNumberSnapshot` plus the existing `Order` relation is enough to identify the order without copying customer PII into a second table.

`OrderStatusHistory` **may** store: `changedByAdminEmailSnapshot`/`changedByAdminNameSnapshot` (an admin's own identity, for accountability — not a customer's), and whatever free-text `note` an admin chooses to write (bounded by Section 6's rules, including the explicit "never a secret" guidance).

## 14. Future Testing Plan (For the Implementation Milestone, Not This One)

- Unauthenticated `PATCH /api/admin/orders/:orderNumber/status` → `401`.
- An invalid transition (e.g. `DELIVERED → PENDING`) → `400`, no row written, no status changed.
- A valid transition creates **exactly one** `OrderStatusHistory` row — not zero, not two.
- A valid transition updates `Order.status` to the requested value.
- The audit-row write and the status-field write happen inside **one transaction** — verified by forcing a failure after the audit write (e.g. a test-only hook) and confirming the status field did *not* change either.
- `paymentStatus` is unchanged by any status-update call, for every tested transition.
- `Order` totals (`subtotal`/`deliveryFee`/`discountTotal`/`total`) and `items` are byte-for-byte unchanged after a status update.
- Cancelling without a note → `400`; cancelling with a note → succeeds and the note is stored.
- `DELIVERED` and `CANCELLED` reject every attempted further transition.
- The admin dashboard's existing routes remain `401` for unauthenticated requests (regression check — this feature must not weaken anything Milestone 59 already proved).
- PayFast remains disabled throughout (regression check, same as every prior milestone's testing plan).

## 15. Risks

- **Retrofitting `PAYFAST_ITN` as a real audit source is unresolved.** Section 5 deliberately reserves this value without implementing it — a future milestone must decide whether to add audit logging inside `payfast.service.ts`'s existing ITN handler, and that handler's correctness/security (already proven, already live) must not be put at risk by bolting an audit write onto it carelessly.
- **`source` as a free string rather than a Prisma enum** trades compile-time safety for schema-migration flexibility — the implementation milestone should decide (not assumed here) whether application-level validation (a `SOURCE_VALUES` constant, matching this project's existing `SORT_OPTIONS`/`STOCK_OPTIONS` pattern in `query.ts`) is sufficient, or whether a real Prisma enum is worth the extra migration cost.
- **`Order.fulfilmentStatus`/`Shipping.status` staying uncoordinated with `Order.status` (Option A, Section 8)** is a deliberate deferral, not a permanent answer — if a future admin feature lets staff update fulfilment/shipping fields directly, that feature will need its own transition/audit design, likely reusing much of this document's structure.
- **A 500-character note limit (Section 6) could feel restrictive** for a genuinely complex cancellation explanation — worth revisiting with real usage data once the feature ships, not something to over-design for now.
- **Building the write endpoint (Milestone 63) before this audit model is actually implemented (Milestone 62) would repeat Milestone 60's core warning** — the ordering in Section 16 exists specifically to prevent that.

## 16. Recommended Next Milestones

1. **Milestone 60** — Order status update workflow planning (done, merged).
2. **Milestone 61** — Order status audit model planning (this milestone).
3. **Milestone 62** — Order status audit model implementation: add `OrderStatusHistory` to `schema.prisma` exactly as designed in Section 3, generate the migration via `--create-only` (not applied), apply only as its own explicit approval step, following this project's established shared-database migration discipline.
4. **Milestone 63** — Order status update backend implementation: the actual `PATCH /api/admin/orders/:orderNumber/status` route (Section 9), transition validation, the audited transaction (Section 7) — only after Milestone 62's migration is applied and independently verified.
5. **Milestone 64** — Order status update frontend implementation: the admin order-detail page gains the status-change control and audit timeline (Sections 10-11), only after Milestone 63 is live and tested.
6. **Milestone 65** — Admin enquiries management: status updates for `Enquiry`, following this same "plan → audit → backend → frontend" phased discipline.
7. **Milestone 66** — Admin product stock notes: a non-destructive way to leave a stock note, still no product add/edit.
8. **Milestone 67** — Product add and edit planning.

## 17. Safety Confirmation

- Only documentation was added — `VERSION_7_ORDER_STATUS_AUDIT_MODEL_PLAN.md`.
- No code files changed.
- No schema changed — `backend/prisma/schema.prisma` untouched.
- No migration created.
- No production data changed.
- No order status changed.
- No payment status changed.
- No admin write route added.
- No update button added.
- No PayFast changes.
- No checkout changes.
- No `.env` file changed.
- No credentials added.
- No real email sent.
- No test order created.
