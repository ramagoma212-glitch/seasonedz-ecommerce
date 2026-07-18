# Email Setup (Version 3, Milestone 24 — Preparation Only)

This document covers **preparation only**. No real email is sent by
anything in this codebase yet, no email provider is integrated, and no
order/payment/enquiry flow automatically triggers an email. This
milestone builds a clean email service + templates so a future
milestone only has to wire up a real provider and call the functions
that already exist.

## Environment Variables

All defined in `backend/.env.example` with safe placeholders only:

| Variable | Purpose |
|---|---|
| `EMAIL_ENABLED` | Feature flag — see "Why Real Email Sending Is Disabled by Default" below. Defaults to `false` |
| `EMAIL_PROVIDER` | `console` (log-only, default) or a future real provider name |
| `EMAIL_FROM_NAME` | Display name emails would be sent from. Defaults to `Seasonedz Group` |
| `EMAIL_FROM_ADDRESS` | Sender address — **required only if `EMAIL_ENABLED=true`** |
| `ADMIN_NOTIFICATION_EMAIL` | Where admin notifications (new order, new enquiry) would go — **required only if `EMAIL_ENABLED=true`** |
| `RESEND_API_KEY` | Optional — only used once a Resend integration actually exists |
| `SENDGRID_API_KEY` | Optional — only used once a SendGrid integration actually exists |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Optional — only used once a direct SMTP integration actually exists |

`src/config/env.ts` reads all of these. `EMAIL_FROM_ADDRESS` and
`ADMIN_NOTIFICATION_EMAIL` are only **eagerly required** (the backend
refuses to start without them, naming exactly which are missing) when
`EMAIL_ENABLED=true`. With the default `EMAIL_ENABLED=false`, none of
these — including every provider credential — need to be set at all.
Provider API keys are **never** validated at startup, even when
`EMAIL_ENABLED=true`, because no provider is actually wired up yet;
whichever milestone picks a real provider should add that provider's
specific requirement at the point it starts being used, not before.

## Provider Options for the Future

`EMAIL_PROVIDER` is a plain string, not yet an enum enforced anywhere
beyond "console" being the only behaviour that actually does anything
(see below). Realistic future options, roughly in order of how simple
they'd be to add:

- **Resend** — modern API, simple REST call, common choice for small
  Node backends. Needs `RESEND_API_KEY`.
- **SendGrid** — mature, widely used, slightly more setup (sender
  verification/domain auth). Needs `SENDGRID_API_KEY`.
- **SMTP** (e.g. via Gmail SMTP or another mailbox provider) — most
  portable (works with almost any mail account), but the most fiddly
  to configure correctly (App Passwords, TLS, port numbers). Needs
  `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`.

No provider has been chosen yet. Whichever is picked, the integration
work only needs to replace one branch inside
`src/services/email/email.service.ts`'s `dispatch()` function — see
"What Templates Exist" below for what's already built around it.

## Why Real Email Sending Is Disabled by Default

`EMAIL_ENABLED` is the same kind of safety switch as `PAYFAST_ENABLED`
(Milestone 20): a feature that touches something external (real
customer inboxes, in this case) stays fully inert until someone
deliberately turns it on, and the backend never requires credentials
for a feature that isn't in use. Beyond that default-off gate, three
more layers keep this milestone genuinely harmless even if
`EMAIL_ENABLED` were accidentally left `true` locally:

1. **No provider is integrated.** `EMAIL_PROVIDER=console` (the
   default) never sends anything — it only logs safe metadata (see
   below). Any other provider name currently just logs a "not
   implemented yet" warning instead of guessing at a real send.
2. **Nothing calls the email service automatically.** Order creation,
   PayFast ITN verification, and enquiry creation are all unchanged by
   this milestone — see "Where Emails Will Be Triggered Later" below
   for exactly where those calls will go once a future milestone wires
   them up.
3. **No real credentials exist anywhere in this repo.** `.env.example`
   ships every provider variable empty; real values would only ever go
   in the git-ignored `backend/.env`, and none are needed while
   `EMAIL_ENABLED=false`.

## Console Mode: What Gets Logged (and What Never Does)

When `EMAIL_ENABLED=true` and `EMAIL_PROVIDER=console`, a "send" logs
one line of safe metadata (log format improved in Version 6,
Milestone 53 to add recipient role and a short preview):

```
[email:console] template="order-created" role="customer" to="j***@e***.com" ref="SG-2026-A1B2" subject="Your Seasonedz Group Order SG-2026-A1B2 Has Been Received" preview="Thank you for your order with Seasonedz Group! We've received order SG-2026-A1B2..."
```

- **Template name** — which email this represents.
- **Recipient role** — `customer` or `admin`, so a developer scanning
  logs can tell at a glance who a given line was headed to, without
  needing to decode the masked address.
- **Masked recipient** — only the first character of the local part
  and of the domain's first label survive (`maskEmail()` in
  `email.service.ts`); the rest is replaced with `***`.
- **Order number or enquiry reference** — never an internal database
  ID for orders (matches the rest of the API's convention).
- **Subject line** — safe; contains no personal data beyond the order
  number, which is already not sensitive.
- **Preview** — the first non-greeting line of the body (`safePreview()`
  in `email.service.ts`), truncated to 80 characters. Deliberately
  skips the "Hi {name}," greeting line (the only line carrying the
  customer's name) and, for enquiry emails, never touches the
  customer's own free-text message — only generic template wording or
  an already-non-sensitive reference ever appears here.

**Never logged:** the full rendered email body, the customer's own
enquiry message text, the full recipient email address, delivery
address, phone number, any raw PayFast ITN payload, or any
secret/credential.

## What Templates Exist

`src/services/email/emailTemplates.ts` — plain-text, South African
English ("colouring", not "coloring"), simple/professional/warm tone,
not salesy, no dash symbols in customer-facing copy:

| Template | Function | Used by |
|---|---|---|
| Order created (any payment method) | `renderOrderCreatedEmail` | `sendOrderCreatedEmail` |
| Payment still pending (follow-up) | `renderPaymentPendingEmail` | `sendPaymentPendingEmail` |
| Payment confirmed | `renderPaymentConfirmedEmail` | `sendPaymentConfirmedEmail` |
| Payment failed or cancelled | `renderPaymentFailedOrCancelledEmail` | `sendPaymentFailedEmail` |
| Enquiry received (Contact/School/Wholesale/Distributor) | `renderEnquiryReceivedEmail` | `sendEnquiryReceivedEmail` |
| Admin: new order notification | `renderAdminNewOrderEmail` | `sendAdminNewOrderEmail` |
| Admin: new enquiry notification | `renderAdminNewEnquiryEmail` | `sendAdminNewEnquiryEmail` |

Every customer-facing template includes: the customer's first name (or
enquiry name), an order number or enquiry reference, order total
(formatted as e.g. `R539.00`) where relevant, payment method and/or
status where relevant, a safe next step, and a short contact line. The
"order created" and "payment pending" templates' next-step line adapts
to the payment method — **no fake bank account details are included**;
a `BANK_TRANSFER` order gets the placeholder line *"Bank transfer
details will be shared by Seasonedz Group."* until real banking
details are safely configured somewhere (not yet, and not part of this
milestone). "Payment pending" (Milestone 53) is a gentle follow-up
distinct from "order created" — for an order that has stayed `PENDING`
for a while, per `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s "Pending
Payment Follow-Up Process." "Enquiry received" (Milestone 53) is the
customer-facing counterpart to the existing admin notification — one
shared function covers all four enquiry types, varying only the
opening line.

`src/services/email/email.types.ts` defines the input shapes
(`OrderEmailData`, `EnquiryEmailData`) each template needs —
deliberately independent of `order.service.ts`'s `OrderOutput` or
`enquiry.service.ts`'s `EnquiryCreateOutput`, since a template only
needs a handful of fields. Whichever milestone wires real sending maps
from the real `Order`/`Enquiry` record onto these small shapes before
calling a `send*Email` function.

## Where Emails Will Be Triggered Later

**Nothing is wired up yet — these are documented hook points for a
future milestone, not calls that exist today.** Reviewed during this
milestone:

- **`backend/src/controllers/order.controller.ts`,
  `createOrderHandler`** (line 16, right after
  `orderService.createOrder(...)` succeeds, before the success
  response is sent): would call `sendOrderCreatedEmail(...)` (to the
  customer) and `sendAdminNewOrderEmail(...)` (to
  `ADMIN_NOTIFICATION_EMAIL`).
- **`backend/src/services/payfast.service.ts`,
  `processPayfastNotification`** — inside the `"COMPLETE"` case
  (around line 305, right after the `Payment`/`Order` are updated to
  `PAID`/`CONFIRMED`): would call `sendPaymentConfirmedEmail(...)`.
  Inside the `"FAILED"` case (around line 335) and the `"CANCELLED"`
  case (around line 358): would call `sendPaymentFailedEmail(...)`.
  **Only inside the branches that already represent a *newly*
  resolved status** — not the early-return idempotency branches
  (duplicate `COMPLETE` on an already-`PAID` order, or a stale
  `FAILED`/`CANCELLED` after `PAID`) — so a repeated ITN notification
  can never cause a duplicate email either, once this is wired up.
- **`backend/src/controllers/enquiry.controller.ts`,
  `createEnquiryHandler`** (line 15, right after
  `enquiryService.createEnquiry(...)` succeeds): would call
  `sendAdminNewEnquiryEmail(...)` **and** `sendEnquiryReceivedEmail(...)`
  (Milestone 53's new customer-facing acknowledgement).
- **A future scheduled/manual check** (not a request-triggered hook —
  see `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`'s "Pending Payment
  Follow-Up Process"): would call `sendPaymentPendingEmail(...)` for a
  `BANK_TRANSFER`/`CASH_ON_DELIVERY` order that has stayed `PENDING`
  past a defined window. This has no natural request-handler hook point
  the way the others do, since nothing in today's codebase runs on a
  schedule — a future milestone adding this would need to decide how
  that check runs at all (cron, manual admin trigger, etc.) before
  deciding where this call goes.

None of these files were modified by this milestone (Version 6,
Milestone 53 touched only `src/services/email/` and this document) —
order creation, ITN verification, and enquiry creation all behave
exactly as they did before. Wiring these calls in is deliberately left
for a later milestone, once a real provider decision has been made and
this can be tested with an actual send (or at least a fully wired
console-mode dry run through the real request flows, not just direct
template/service calls as this milestone and Milestone 24 both
tested).

## No Secrets in Frontend

Nothing in this milestone touches the frontend at all — email is a
backend-only concern. No `VITE_`-prefixed email variable exists or
should ever exist; a customer's browser has no legitimate reason to
know an email provider's API key, an admin's notification address, or
anything else in this document.
