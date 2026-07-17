# Version 6 — Admin Order Monitoring Plan (Milestone 44)

A planning-only document. No admin dashboard exists yet, and this
milestone doesn't build one — it documents the manual process Seasonedz
Group needs to follow today, using what already exists (direct
database access, the customer-facing tracking page, and — once
connected — the PayFast merchant dashboard), until a real admin
dashboard is built.

## How Orders Are Currently Created

Every order goes through `POST /api/orders`, which:

- Verifies every product and price server-side (never trusts a
  client-supplied price).
- Reduces stock inside a database transaction.
- Creates the order as `status: PENDING`, `paymentStatus: PENDING`.
- For `BANK_TRANSFER` and `CASH_ON_DELIVERY`: nothing further happens
  automatically — there is no server-side confirmation step for these
  methods today, by design (see `backend/PAYFAST_SETUP.md`).
- For `PAYFAST` (currently disabled in production): `paymentStatus`
  only ever moves to `PAID` via a verified ITN
  (`POST /api/payments/payfast/notify`), never from anything the
  frontend does.

There is no admin dashboard — every check below relies on direct
database access (Prisma Studio, or a simple read-only query) or the
customer-facing `GET /api/orders/:orderNumber/tracking` endpoint.

## Monitoring Manual Bank Transfer Orders

Bank Transfer orders never self-confirm — a human must:

1. Check for new orders with `paymentMethod: BANK_TRANSFER` and
   `paymentStatus: PENDING`.
2. Confirm the actual bank transfer arrived (via the real business bank
   account/statement — outside this codebase entirely).
3. Once confirmed, manually update that order's `paymentStatus` to
   `PAID` and `status` to `CONFIRMED` directly in the database (no API
   route exists for this yet — see "Recommended Future Admin Dashboard
   Features" below).
4. If the transfer never arrives within a reasonable window, follow
   the "Pending Payment Follow-Up Process" below.

## Monitoring Future PayFast Paid Orders

Once PayFast is enabled (not yet — see
`VERSION_6_PAYFAST_PRODUCTION_ENABLEMENT_PLAN.md`), `PAYFAST` orders
confirm themselves automatically via the verified ITN — no manual
status update is needed for the payment itself. The daily check becomes:

1. Cross-check orders showing `paymentStatus: PAID` in the database
   against the PayFast merchant dashboard's own transaction list — the
   PayFast dashboard is the authoritative source for "was this
   genuinely charged," independent of this codebase.
2. Treat any order that's `PAID` in the database but **not** visible in
   the PayFast dashboard (or vice versa) as an immediate investigation
   item — this should never normally happen, and would indicate either
   a bug or a genuinely suspicious transaction.

## Daily Order Check Process

Every day, the responsible person should:

1. List all orders created since the last check.
2. Group by `paymentStatus`: `PENDING`, `PAID`, `FAILED`, `CANCELLED`.
3. For `PENDING` `BANK_TRANSFER`/`CASH_ON_DELIVERY` orders: check for a
   matching bank transfer or arrange COD collection.
4. For `PAID` orders (any method): move to the fulfilment process
   below.
5. For `FAILED`/`CANCELLED`: confirm nothing needs manual follow-up
   (see below).

## Pending Payment Follow-Up Process

- If a `BANK_TRANSFER` order stays `PENDING` for longer than a
  reasonable window (e.g. 2-3 business days), contact the customer
  using the contact details on the order.
- If a `PAYFAST` order (once enabled) stays `PENDING` for more than a
  few minutes, this usually means the customer abandoned the PayFast
  page or the payment didn't complete — the customer's own
  payment-status page already tells them this and offers "Try PayFast
  Again" for `FAILED`/`CANCELLED` (never for `PENDING` — see
  `VERSION_5_RETRY_PENDING_RISK_FIX.md`). No merchant-side action is
  usually needed unless the customer reports a problem directly.

## Paid Order Fulfilment Process

Once an order is genuinely `PAID`:

1. Prepare the order for shipping/collection.
2. Update `Order.fulfilmentStatus` and the related `Shipping` fields
   (`status`, `courierName`, `trackingNumber`, `trackingUrl`,
   `shippedAt`, `deliveredAt`) directly in the database — see
   `backend/DELIVERY_SETUP.md`'s "Manual Courier Process."
3. The customer's Track Order page reflects whatever was set here —
   it's an honest status display, not a live courier feed (see
   `VERSION_6_COURIER_INTEGRATION_PLAN.md`).

## Cancelled or Failed Payment Process

- A `FAILED` or `CANCELLED` PayFast payment deliberately does **not**
  cancel the order itself (`Order.status` stays as it was) — this is a
  documented decision so the customer can still retry (see
  `backend/PAYFAST_SETUP.md`'s "FAILED/CANCELLED `order.status`
  decision").
- If a customer clearly won't retry (e.g. they've said so directly),
  manually set `Order.status` to `CANCELLED` and consider whether stock
  needs to be manually restored — today's code never automatically
  restores stock for a failed/cancelled payment, since stock is
  decremented once at order creation regardless of payment outcome.

## Manual Stock Check Process

- Periodically compare `Product.stockQuantity` in the database against
  actual physical stock on hand.
- Any order cleanup (test data, cancelled orders where stock should be
  restored) must be done carefully and deliberately — see every
  Version 4/5 milestone's own cleanup sections for the established,
  safe pattern (identify exact order numbers, delete, then restore
  stock by exactly the right amount, never touching real customer
  orders).

## Refund or Issue Handling Process

- **Bank Transfer**: refund directly via the business's own bank
  (outside this codebase).
- **PayFast** (once enabled): refund via the PayFast merchant
  dashboard — this codebase has no refund API integration.
- For any refund, manually update the order's status to reflect it
  (there is no `REFUNDED` automation yet) so the customer's tracking
  page reflects reality.

## What the Business Owner Should Check Every Day

- New orders (all payment methods).
- Any `PENDING` `BANK_TRANSFER`/`CASH_ON_DELIVERY` order older than a
  day or two.
- The PayFast merchant dashboard (once live) for new transactions.
- Any customer message (contact form, WhatsApp, email) asking about an
  order or payment.

## What the Developer Should Not Do Manually

- The developer should not be the one deciding whether a real bank
  transfer arrived, issuing a refund, or making customer-facing
  fulfilment decisions — those are business/owner decisions.
- The developer should not use direct database writes as a substitute
  for a real admin workflow long-term — it's an accepted stopgap now,
  not the intended permanent process.
- The developer must never enter or view real banking/PayFast
  credentials as part of "monitoring" — monitoring only ever needs the
  database's own order records and (for the owner) the PayFast
  dashboard's own login, never shared with the developer.

## Risks Because There Is No Admin Dashboard Yet

- Every status update is a manual, unaudited direct database write —
  no history of who changed what, or when, beyond `updatedAt`.
- No automated alerting — a `PENDING` order or a customer message can
  be missed if nobody checks.
- No built-in reconciliation between this database and the PayFast
  dashboard — cross-checking is entirely manual today.
- Human error risk on direct database edits (typos, wrong order,
  accidentally touching `SG-2026-28SM` or another real order) — always
  double-check the exact order number before any manual update.

## Recommended Future Admin Dashboard Features

In rough priority order for whenever this becomes worth building:

1. A simple authenticated order list, filterable by `paymentStatus`/
   `fulfilmentStatus`, replacing direct database queries for the daily
   check.
2. A one-click "mark Bank Transfer as paid" action (with an audit
   log), replacing manual `paymentStatus` writes.
3. A fulfilment/shipping status update form, replacing manual
   `Shipping` field writes.
4. A PayFast transaction cross-check view (comparing this database
   against the PayFast dashboard's own data, if PayFast's API supports
   fetching transaction history).
5. Basic alerting (e.g. a daily summary email once
   `VERSION_6_EMAIL_SERVICE_PLAN.md`'s plan is implemented) for
   orders needing attention.
