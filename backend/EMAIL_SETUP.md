# Email Setup (Version 3, Milestone 24 — preparation; Version 7,
# Milestone 117 — Brevo wired in as a real provider, still off by default)

Brevo is now wired in as a real transactional email provider
(`EMAIL_PROVIDER=brevo`), and all four documented hook points below are
now genuinely wired up (order creation, PayFast payment resolution,
enquiry creation). **Real sending still stays off by default** —
`EMAIL_ENABLED=false` — until this is deliberately turned on in Render
once a real `BREVO_API_KEY` is added there.

## Environment Variables

All defined in `backend/.env.example`. The non-secret ones (from
address, admin recipient, reply-to) have real placeholder values
already filled in, since they're Seasonedz Group's own public-facing
addresses, not secrets — only `BREVO_API_KEY` stays blank.

| Variable | Purpose |
|---|---|
| `EMAIL_ENABLED` | Feature flag — see "Why Real Email Sending Is Disabled by Default" below. Defaults to `false` |
| `EMAIL_PROVIDER` | `console` (log-only) or `brevo` (real send via Brevo's REST API) |
| `EMAIL_FROM_NAME` | Display name emails are sent from. Defaults to `Seasonedz Group` |
| `EMAIL_FROM_ADDRESS` | Verified Brevo sender address — **required only if `EMAIL_ENABLED=true`** |
| `ADMIN_NOTIFICATION_EMAIL` | Where admin notifications (new order, new enquiry) go — **required only if `EMAIL_ENABLED=true`** |
| `EMAIL_REPLY_TO` | Where a reply to a transactional email actually reaches — **required only if `EMAIL_ENABLED=true` and `EMAIL_PROVIDER=brevo`** |
| `BREVO_API_KEY` | Brevo's own API key (SMTP & API → API Keys in Brevo's dashboard) — **secret; required only if `EMAIL_ENABLED=true` and `EMAIL_PROVIDER=brevo`**. Add directly in Render, never in this repo. |
| `RESEND_API_KEY` / `SENDGRID_API_KEY` / `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Unused placeholders — only relevant if a different provider is ever chosen instead |

`src/config/env.ts` reads all of these. `EMAIL_FROM_ADDRESS` and
`ADMIN_NOTIFICATION_EMAIL` are eagerly required whenever
`EMAIL_ENABLED=true`; `BREVO_API_KEY`/`EMAIL_REPLY_TO` are additionally
required only when `EMAIL_PROVIDER=brevo` — an unrelated provider value
(e.g. `console`) is never blocked from starting just because those two
aren't set. With the default `EMAIL_ENABLED=false`, none of these need
to be set at all.

## Provider: Brevo

`src/services/email/providers/brevo.provider.ts` calls only Brevo's
transactional send endpoint — `POST https://api.brevo.com/v3/smtp/email`
— never a campaign, list, or marketing-unsubscribe endpoint, and never
with an attachment. `email.service.ts`'s `dispatch()` is the only
caller, and it catches every failure (network error, timeout, bad key,
4xx/5xx) and logs a safe warning instead of throwing — an order,
enquiry, or PayFast ITN must always succeed regardless of whether the
email actually sent. Plain-text body only for now (`textContent`); an
HTML variant can be added later once templates produce safe HTML,
not assumed here.

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

## Where Emails Are Triggered

**Wired up as of Version 7, Milestone 117** — all fire-and-forget
(`.catch(() => {})`), never awaited into the response, and safe no-ops
while `EMAIL_ENABLED=false` (the current default everywhere, including
production):

- **`backend/src/controllers/order.controller.ts`,
  `createOrderHandler`**, right after `orderService.createOrder(...)`
  succeeds: calls `sendOrderCreatedEmail(...)` (to the customer) and
  `sendAdminNewOrderEmail(...)` (to `ADMIN_NOTIFICATION_EMAIL`).
- **`backend/src/services/payfast.service.ts`,
  `processPayfastNotification`** — inside the `"COMPLETE"` case, right
  after the `Payment`/`Order` are updated to `PAID`/`CONFIRMED`: calls
  `sendPaymentConfirmedEmail(...)`. Inside the `"FAILED"` and
  `"CANCELLED"` cases: calls `sendPaymentFailedEmail(...)`. **Only
  inside the branches representing a *newly* resolved status** — never
  the early-return idempotency branches (duplicate `COMPLETE` on an
  already-`PAID` order, or a stale `FAILED`/`CANCELLED` after `PAID`)
  — so a repeated ITN notification can never cause a duplicate email.
- **`backend/src/controllers/enquiry.controller.ts`,
  `createEnquiryHandler`**, right after
  `enquiryService.createEnquiry(...)` succeeds: calls
  `sendAdminNewEnquiryEmail(...)` **and** `sendEnquiryReceivedEmail(...)`.
- **Still not wired** (unchanged from before): `sendPaymentPendingEmail(...)`
  has no request-handler hook point — nothing in today's codebase runs
  on a schedule. A future milestone adding a pending-payment follow-up
  check (cron, manual admin trigger, etc.) would decide where this call
  goes then, not now.

Verified entirely with mocked `fetch` (no real Brevo API call, no real
email sent) — see this milestone's own test suite for coverage of the
disabled/console/brevo-success/brevo-failure/idempotency cases.

## No Secrets in Frontend

Nothing in this milestone touches the frontend at all — email is a
backend-only concern. No `VITE_`-prefixed email variable exists or
should ever exist; a customer's browser has no legitimate reason to
know an email provider's API key, an admin's notification address, or
anything else in this document.
