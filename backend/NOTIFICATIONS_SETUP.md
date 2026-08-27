# Notifications Setup (Version 7, Milestone 174B)

One central `Notification` outbox now sits between every business
event (order placed, payment resolved, courier status changed,
affiliate lifecycle, product review, enquiry) and the actual email
send. See `EMAIL_SETUP.md` for the Brevo provider mechanics this
engine sits on top of (env vars, console vs. brevo mode, template
content) — this file covers the outbox itself: why it exists, how it
behaves, and what the owner needs to configure.

## Why an outbox, not a direct send

Before 174B, a business service called `email.service.ts` directly and
the result was never recorded anywhere — a failed send just vanished
into a `console.warn`. Now:

- Every attempted notification is a real, queryable `Notification` row
  (`status`: `PENDING` → `PROCESSING` → `SENT`/`FAILED`/`CANCELLED`),
  visible to any admin via `GET /api/admin/notifications` (list) and
  `GET /api/admin/notifications/:id` (detail, includes the exact
  content sent).
- A failed send is retried automatically (bounded — see "Retries"
  below), not lost.
- A genuine duplicate business event (a repeated PayFast ITN, a
  reprocessed webhook) can never enqueue a second notification — every
  row has a unique `dedupeKey`, enforced by the database itself.
- Nothing about this can ever affect the business action that
  triggered it: every call site enqueues **after** its own transaction
  has already committed, fire-and-forget, and the engine itself never
  throws to its caller.

## No new environment variables

This system reuses `EMAIL_ENABLED`/`EMAIL_PROVIDER`/`EMAIL_FROM_*`/
`ADMIN_NOTIFICATION_EMAIL`/`BREVO_API_KEY` exactly as documented in
`EMAIL_SETUP.md` — there is nothing new to configure to turn real
sending on. With `EMAIL_ENABLED=false` (the default, including
production today), every notification is still recorded as a real row
and immediately marked `SENT` (a safe no-op "send"), so the outbox
itself is fully exercised even while real delivery stays off.

## Content is rendered once, at enqueue time

Each `Notification` row stores its own `renderedSubject`/`renderedBody`
— the exact text a customer or admin will receive, captured once when
the row is created. A retry resends this stored content verbatim; it
never re-fetches the order/affiliate/review and re-renders. This also
means the row itself is a permanent, exact record of what was sent —
useful for support, and the reason the admin detail endpoint exists.

The one exception is `PASSWORD_RESET`: a reset link contains a
one-time token that must never be persisted. That event type is
recorded (so it's still visible in the admin log, and still counts
toward "did this deliver") with `renderedSubject`/`renderedBody` left
null, `maxAttempts: 1` (never retried — a retry would need a fresh
token this table can't provide), and a `dedupeKey` that includes a
random component so a second genuine reset request is never suppressed
as a duplicate.

## Retries

A failed send gets up to 2 automatic retries (3 attempts total),
spaced 5 minutes then 30 minutes apart. A permanently invalid
recipient (no email on the row at all) is never retried — it's marked
`FAILED` immediately with attempts exhausted, since retrying it could
never succeed. Attempts beyond the limit stop; the row stays `FAILED`
and is visible to an admin, never silently dropped.

## The recovery/retry processor

`npm run notifications:process` (backend/prisma/scripts/
processNotifications.ts) finds every notification genuinely due right
now — a `PENDING` row whose immediate send never happened (e.g. the
process crashed between enqueue and send), or a `FAILED` row with
retries remaining whose retry delay has elapsed — and sends each one
through the exact same code path an immediate send uses. Every
candidate is processed in its own try/catch: one row failing
unexpectedly never stops the rest of the batch from being processed.
It claims each row atomically before sending (`PENDING`/`FAILED` →
`PROCESSING`), so running this concurrently with an in-flight immediate
send — or running two overlapping invocations — can never send the
same notification twice.

This is a one-shot script, not a long-running server — nothing in this
backend runs it automatically today (this project's own Render plan is
a single free-tier web service; see `VERSION_7_NOTIFICATION_AUDIT_174A.md`'s
own finding that no scheduler infrastructure exists anywhere in this
codebase). **It must be scheduled externally to be useful beyond
"immediate sends always work anyway."**

### Recommended: a Render Cron Job

Not created by this milestone — a deliberate, owner-approved decision
before adding any paid Render resource. When ready:

- **Command**: `npm run notifications:process` (run from the
  `backend/` directory, same build as the web service).
- **Schedule**: every 15 minutes — frequent enough that a crashed
  immediate send or a failed Brevo call recovers within minutes, far
  below any volume where this project's notification traffic would
  need finer granularity. A cron expression of `*/15 * * * *`.
- **Environment**: the same `DATABASE_URL`/`EMAIL_*`/`BREVO_API_KEY`
  variables as the web service — this script uses the same Prisma
  client and email provider config, nothing extra to add.

Until this cron job exists, every notification still gets its
immediate send attempt at enqueue time (this is the normal path today,
and is what almost every notification will use in practice) — the
processor only ever covers the rare crash-between-enqueue-and-send or
genuine-retry-needed case.

## What triggers a notification today

| Event | Trigger point | Recipient |
|---|---|---|
| `ORDER_PLACED` | `order.controller.ts`, order creation | customer |
| `ADMIN_NEW_ORDER` | `order.controller.ts`, order creation | admin |
| `PAYMENT_RECEIVED` | `payfast.service.ts`, ITN `COMPLETE` (new transition only) | customer |
| `PAYMENT_FAILED` | `payfast.service.ts`, ITN `FAILED`/`CANCELLED` (new transition only) | customer |
| `ORDER_PROCESSING` | `adminOrderStatus.service.ts`, admin marks Processing | customer |
| `ORDER_CANCELLED` | `adminOrderStatus.service.ts`, admin cancels | customer |
| `COURIER_COLLECTED` / `OUT_FOR_DELIVERY` / `DELIVERED` | `courierStatusSync.service.ts`, one per meaningful stage transition (never per provider scan) | customer |
| `ADMIN_DELIVERY_EXCEPTION` | `courierStatusSync.service.ts`, an exception or return stage | admin |
| `AFFILIATE_APPLICATION_RECEIVED` / `ADMIN_NEW_AFFILIATE` | `customerAffiliate.service.ts`, a customer applies | affiliate / admin |
| `AFFILIATE_APPROVED` / `AFFILIATE_REJECTED` / `AFFILIATE_SUSPENDED` | `referralAffiliate.service.ts`, admin status change | affiliate |
| `COMMISSION_APPROVED` | `referralCommission.service.ts`, admin approves a commission | affiliate |
| `PAYOUT_RECORDED` | `referralCommission.service.ts`, admin records a payout — one summary per payout batch, never per commission | affiliate |
| `ADMIN_NEW_REVIEW` | `productReview.service.ts`, a customer submits a review | admin |
| `CUSTOMER_ENQUIRY_ACKNOWLEDGEMENT` / `ADMIN_NEW_ENQUIRY` | `enquiry.controller.ts`, enquiry submitted | customer / admin |
| `PASSWORD_RESET` | `customerAuth.controller.ts`, forgot-password request — recorded only, see above | customer |

### Known, deliberate gaps (not built in 174B)

- **`REFUND`**: not built — `OrderStatus.REFUNDED` has no reachable
  trigger point in today's codebase (confirmed during the 174A audit).
  Building this now would mean guessing at a code path that doesn't
  exist yet.
- **`RETURNED`**: never implies or triggers a refund claim — the
  courier stage and the payment/refund lifecycle are deliberately kept
  separate.
- **Customer Collection**: no dedicated status/notification exists for
  a customer collecting their own order in person — there is no
  courier event to key off, and no other reliable trigger point exists
  today.
- **`ADMIN_LOW_STOCK`/`ADMIN_OUT_OF_STOCK`/`PAYOUT_ELIGIBLE`**: not
  built — none of these have a reliable trigger point in the current
  codebase (no stock-change hook, no scheduled eligibility check).
  Adding a scheduler for these is future work, not a gap in the engine
  itself.
- **Registration/verification/login-alert emails**: out of scope for
  174B by design — not part of this milestone's brief.

## What's deliberately not built yet (174C/174D)

The engine, schema, and channel enum (`EMAIL`/`IN_APP`/`WHATSAPP`) are
all designed to support these without a redesign, but none of them are
built in 174B:

- A customer-facing notification centre (reading `IN_APP` rows).
- Scheduled 7-day post-delivery review requests (the `scheduledAt`/
  `nextAttemptAt` split on every row exists specifically so a
  future-dated enqueue needs no schema change).
- WhatsApp delivery (`NotificationChannel.WHATSAPP` exists as a value
  today; nothing sends through it).

## Admin visibility

`GET /api/admin/notifications` (paginated, filterable by `status` and
`eventType`) and `GET /api/admin/notifications/:id` (full detail,
including the exact `renderedSubject`/`renderedBody` sent) — backend
only as of 174B; a dedicated admin UI page is 174C scope.
