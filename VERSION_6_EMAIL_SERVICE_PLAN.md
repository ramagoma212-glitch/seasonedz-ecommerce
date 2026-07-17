# Version 6 — Email Service Plan (Milestone 46)

Planning only. **No real email is sent as part of this milestone, no
provider is chosen or integrated, and no code was changed.** This
builds on `backend/EMAIL_SETUP.md` (Version 3, Milestone 24) with a
concrete rollout plan for when real sending is eventually wired up.

## Current Dry-Run Email State

- `EMAIL_ENABLED` defaults `false` and is required to be explicitly
  `true` (with `EMAIL_FROM_ADDRESS`/`ADMIN_NOTIFICATION_EMAIL` also set)
  before anything would even attempt to send — same safety-switch
  pattern as `PAYFAST_ENABLED`.
- `EMAIL_PROVIDER` defaults to `"console"` — today, "sending" an email
  means logging it, never a real network call to any provider.
- Five templates already exist and are fully written
  (`backend/src/services/email/emailTemplates.ts`): order created,
  payment confirmed, payment failed/cancelled, admin new order, admin
  new enquiry — all in Seasonedz Group's plain, warm, professional
  tone, using "colouring."
- **Nothing calls any of these functions yet** — order creation, ITN
  processing, and enquiry creation all complete today without
  triggering any email, real or logged. The hook points are documented
  in `backend/EMAIL_SETUP.md` but not wired in.

## Recommended Email Provider Options to Evaluate Later

In rough order of simplicity for a small Node backend:

1. **Resend** — modern API, a single REST call, minimal setup. Good
   default choice if there's no existing mailbox/SMTP preference.
2. **SendGrid** — mature and widely used, but needs sender/domain
   verification before it reliably delivers.
3. **SMTP** (e.g. via an existing business mailbox) — most portable,
   works with almost any provider, but the fiddliest to configure
   correctly (App Passwords, TLS, ports) and the easiest to get wrong
   silently.

No provider is chosen yet — this is a decision for whoever picks up
Milestone 49, informed by whatever mailbox/domain Seasonedz Group
already uses for business email.

## Order Confirmation Email Plan

- Trigger: right after `POST /api/orders` succeeds, for every payment
  method.
- Template: `renderOrderCreatedEmail` (already written) — order number,
  total, payment method, and a next-step line that already correctly
  varies by method (no fake bank details for `BANK_TRANSFER` — a
  placeholder line until real banking details are safely available).
- Recipient: the customer's own email from the order.

## Payment Pending Email Plan

- Not a distinct template today — `PENDING` is the order's default
  state, already communicated via the order-created email's own
  wording rather than a second email.
- If a `PAYFAST` payment is still `PENDING` after a reasonable window,
  a future "still waiting" nudge email could reuse the "payment
  pending" framing already present on the frontend's own pending-state
  pages (`paymentSuccess.js` etc.) — not yet planned as its own
  template; low priority until real order volume justifies it.

## Payment Confirmed Email Plan

- Trigger: inside `processPayfastNotification`'s `COMPLETE` case, after
  the order is genuinely marked `PAID` — never speculatively, never
  from a frontend action.
- Template: `renderPaymentConfirmedEmail` (already written).
- Recipient: the customer.
- Also triggers `sendAdminNewOrderEmail` (or a payment-specific admin
  variant) so the business is notified a real payment came in, feeding
  directly into `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s daily
  check.

## Contact Enquiry Email Plan

- Trigger: right after a `CONTACT`-type enquiry is created.
- Template: `renderAdminNewEnquiryEmail` (already written, generic
  across enquiry types) to the admin notification address; consider a
  short "we received your message" acknowledgement email to the
  customer too (not yet templated — a small addition when this is
  implemented).

## Schools and Wholesale Enquiry Email Plan

- Same mechanism as Contact, using the same
  `renderAdminNewEnquiryEmail` template — it's already generic enough
  to cover `SCHOOL`/`WHOLESALE`/`DISTRIBUTOR` types, since all four
  enquiry types share the same underlying data shape
  (`EnquiryEmailData`).
- Consider whether Schools/Wholesale enquiries deserve a distinct
  admin recipient or priority flag later (bulk orders are often more
  time-sensitive/valuable than a general contact message) — worth a
  small template variation once real enquiry volume shows whether this
  matters.

## Admin Notification Email Plan

- New order, new payment confirmation, and new enquiry all notify
  `ADMIN_NOTIFICATION_EMAIL` — a single address for now; revisit
  whether different notification types need different recipients once
  there's more than one person handling the business's daily
  operations.

## Customer Support Email Plan

- No dedicated "support ticket" flow exists or is planned here — the
  existing Contact form plus a real, monitored inbox is the support
  channel. `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md` already covers
  "customer WhatsApp or email support is ready" as an operational
  checklist item, not something this email plan needs to build.

## Required Environment Variables Later (Placeholders Only)

No real values here — these are the variable *names* a future
implementation would need, per whichever provider is chosen:

| Variable | Needed for |
|---|---|
| `EMAIL_ENABLED` | Already exists — flips real sending on |
| `EMAIL_PROVIDER` | Already exists — selects the provider branch |
| `EMAIL_FROM_NAME` / `EMAIL_FROM_ADDRESS` | Already exist |
| `ADMIN_NOTIFICATION_EMAIL` | Already exists |
| `RESEND_API_KEY` | If Resend is chosen |
| `SENDGRID_API_KEY` | If SendGrid is chosen |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | If SMTP is chosen |

All already reserved in `backend/.env.example` with empty placeholder
values — no new variable names are introduced by this plan.

## Security Rules

- Never commit a real provider API key or SMTP password to any tracked
  file — same discipline as every credential in this project.
- Never log the raw email body or recipient list in production-level
  logs beyond what's already safe (order number, template name) — no
  customer PII beyond what's already visible elsewhere (e.g. order
  confirmation pages).
- `EMAIL_ENABLED` must stay `false` in every deployed environment until
  a provider is actually chosen, configured, and tested — the same
  "off until deliberately proven" discipline used for
  `PAYFAST_ENABLED`.

## No Real Email Sending Yet

Confirmed: this milestone changes nothing about `EMAIL_ENABLED`,
sends no real email, and adds no provider integration. Everything above
is planning for Milestone 49.

## Recommendation on What to Implement First

1. Wire up the **order confirmation email** first (Milestone 49's
   first step) — it's the single highest-value email (every customer
   gets one, regardless of payment method), uses an already-written
   template, and needs no new template work.
2. Then **admin new-order notification** — directly supports
   `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s daily check, replacing
   "manually query the database" with "check an inbox."
3. Then **payment confirmed** (once PayFast is live) and **admin new
   enquiry** — both already templated, straightforward to wire in once
   the first provider integration exists and is proven reliable.
4. Choose the provider (Resend recommended as the simplest default)
   only once ready to actually implement — no need to decide earlier
   than that.
