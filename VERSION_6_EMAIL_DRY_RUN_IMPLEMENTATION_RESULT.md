# Version 6 — Email Dry Run Implementation Result (Milestone 53)

Improves the email dry-run system built in Version 3 (Milestone 24)
and planned further in Version 6's `VERSION_6_EMAIL_SERVICE_PLAN.md`
(Milestone 46), so Seasonedz Group is closer to ready for real email
sending later. **No real email is sent by anything in this milestone,
no provider is connected, no API key was added, and no business logic
(order creation, checkout, payment, enquiry submission) was changed.**

## What Was Reviewed

- `backend/src/services/email/email.service.ts`,
  `email.types.ts`, `emailTemplates.ts` — the existing dry-run email
  module.
- `backend/EMAIL_SETUP.md` — the canonical documentation for this
  module, including its documented (but not wired-up) hook points.
- `backend/src/controllers/order.controller.ts`,
  `backend/src/services/payfast.service.ts`,
  `backend/src/controllers/enquiry.controller.ts` — the order
  creation, PayFast ITN, and enquiry creation flows, to confirm none
  of them call the email service today (they don't — confirmed by
  `grep` finding zero references to any `send*Email` function outside
  `src/services/email/`).
- `backend/src/config/env.ts` — the `EMAIL_ENABLED`/`EMAIL_PROVIDER`
  config block and its startup validation.
- `VERSION_6_EMAIL_SERVICE_PLAN.md` — Milestone 46's rollout plan,
  which explicitly flagged both gaps this milestone fills: a
  "payment pending" template ("not yet planned as its own template")
  and customer-facing enquiry acknowledgements ("not yet templated — a
  small addition when this is implemented").
- `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md` — confirmed the "Pending
  Payment Follow-Up Process" section, which the new payment-pending
  template is designed to eventually support.

## Confirmed Current Email State

- `EMAIL_ENABLED` defaults to `false` (`backend/src/config/env.ts`) —
  confirmed the local `backend/.env` doesn't even set this variable,
  so it falls through to the code default.
- No real email provider is connected. `EMAIL_PROVIDER` defaults to
  `"console"`, which only logs safe metadata — no network call to any
  email API happens at any point in this codebase.
- No email API key is required for the app to run — `RESEND_API_KEY`,
  `SENDGRID_API_KEY`, and `SMTP_*` are present in
  `backend/.env.example` only as empty placeholders, and are never
  read or validated by `env.ts`.
- No real emails are sent in production or anywhere else — confirmed
  by code inspection of `dispatch()` in `email.service.ts`: the first
  line is `if (!env.emailEnabled) return;`, and every other branch
  either logs to the console or logs a "not implemented" warning.
- Email dry-run is console-log only. Nothing calls any `send*Email`
  function from order creation, PayFast ITN processing, or enquiry
  creation — confirmed by `grep` across `backend/src` outside the
  email module itself, matching what `EMAIL_SETUP.md` already
  documented.

## Templates Added or Improved

Added two new templates to `emailTemplates.ts`, both exported and
wired into `email.service.ts` as `send*Email` functions, matching the
existing pattern exactly:

- **`renderPaymentPendingEmail`** (`sendPaymentPendingEmail`) — a
  gentle follow-up for an order that has stayed `PENDING` for a while,
  distinct from "order created" (which already states Pending as the
  order's normal starting state). States the order number and total,
  reuses the existing `paymentInstructions()` helper for a
  method-aware next step, and invites the customer to get in touch if
  they've already paid or their plans have changed.
- **`renderEnquiryReceivedEmail`** (`sendEnquiryReceivedEmail`) — the
  customer-facing counterpart to the existing admin-only
  `renderAdminNewEnquiryEmail`. One shared function covers Contact,
  School, Wholesale and Distributor enquiries alike (matching
  `EnquiryEmailData`'s existing single shape), varying only the
  opening line via a new `enquiryTypeIntro()` helper. Confirms receipt
  and the enquiry reference, and sets an honest expectation ("a member
  of our small team will get back to you soon") without promising a
  specific response time.

Improved two existing templates for tone consistency:

- `renderPaymentConfirmedEmail` — replaced an em dash ("Good news — your
  payment...") with a colon ("Good news: your payment..."), per the
  instruction to avoid dash symbols in visible customer copy.
- `paymentInstructions()`'s `PAYFAST` branch — replaced an em dash the
  same way ("...is being processed — we'll email..." → "...is being
  processed. We'll email...").

All five pre-existing templates were re-read in full; no other dash
symbols, emoji, or "coloring" spellings were found.

## Provider Readiness Notes

No provider is connected or chosen. For whenever real sending is
approved, in order of setup simplicity:

1. **Resend** — modern REST API, a single HTTP call, minimal setup.
   Needs `RESEND_API_KEY` only.
2. **SendGrid** — mature and widely used, but needs sender/domain
   verification before it reliably delivers. Needs `SENDGRID_API_KEY`.
3. **SMTP** (an existing business mailbox) — most portable, but the
   fiddliest to configure correctly (App Passwords, TLS, ports). Needs
   `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS`.

**Environment variables needed later (placeholder names only, no real
values added by this milestone):** all already reserved, empty, in
`backend/.env.example` — `RESEND_API_KEY`, `SENDGRID_API_KEY`,
`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`. No new variable
names were introduced.

**Security rules for API keys, when that day comes:**

- Never commit a real provider API key or SMTP password to any
  tracked file — the same discipline already used for every other
  credential in this project (PayFast keys, database URL).
- Real values only ever go in the git-ignored `backend/.env` locally,
  or the hosting platform's (Render's) own environment variable
  settings for production — never in a file this repository tracks.
- `EMAIL_ENABLED` must stay `false` in every deployed environment
  until a provider is actually chosen, configured, and tested — the
  same "off until deliberately proven" discipline as
  `PAYFAST_ENABLED`.
- Provider credentials should never be logged, even at debug level —
  `dispatch()`'s console branch already only ever logs the metadata
  described below, never an API key or provider response.

**Which emails to implement first, when real sending is approved**
(unchanged from `VERSION_6_EMAIL_SERVICE_PLAN.md`'s recommendation,
still the right order):

1. Order confirmation (`sendOrderCreatedEmail`) — highest value, every
   customer gets one, template already exists.
2. Admin new-order notification (`sendAdminNewOrderEmail`) — directly
   supports the daily order check in
   `VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md`.
3. Payment confirmed (once PayFast is live) and admin new enquiry —
   both already templated.
4. Enquiry received and payment pending (this milestone's additions) —
   genuinely useful but lower urgency than the above; enquiry received
   is a nice-to-have acknowledgement (the admin notification is the
   operationally important half), and payment pending has no natural
   request-triggered hook point yet (see `EMAIL_SETUP.md`'s "Where
   Emails Will Be Triggered Later" — it would need a scheduled or
   manually-triggered check, which doesn't exist in this codebase
   today).

## Safety Confirmation

- `EMAIL_ENABLED=false` remains the default — not changed by this
  milestone, confirmed by reading `env.ts` (untouched) and by the
  local `.env` not setting it at all.
- Missing email provider credentials cannot crash the app while
  `EMAIL_ENABLED=false` — confirmed by code inspection: `env.ts`'s
  credential-requirement check is inside `if (emailEnabled) { ... }`,
  entirely skipped when the flag is off (untouched by this milestone).
- Dry-run logs never print secrets — no provider credential is read or
  logged anywhere in `email.service.ts`, then or now.
- Dry-run logs don't expose full private customer details — verified
  by locally running all seven templates with `EMAIL_ENABLED=true
  EMAIL_PROVIDER=console` (inline env override, `backend/.env` was not
  edited): every log line shows only a masked email, an order/enquiry
  reference, a subject line, and an 80-character preview that
  deliberately skips the greeting line (the only line with the
  customer's name) and, for enquiries, never surfaces the customer's
  own free-text message.
- No code outside `backend/src/services/email/` was changed. Order
  creation, checkout, PayFast, and enquiry submission behave exactly
  as before — confirmed nothing in `order.controller.ts`,
  `enquiry.controller.ts`, or `payfast.service.ts` was touched.

## Real Email Sending Status

Disabled, exactly as before this milestone. No provider is connected.
No API key exists anywhere in this repository. Nothing in the app
calls the email service automatically.

## Testing Result

Ran a temporary, uncommitted local script
(`backend/src/scripts/testEmailDryRun.ts`, deleted immediately after
testing — not part of this commit) that called all seven `send*Email`
functions directly with sample data:

| Check | Result |
|---|---|
| `EMAIL_ENABLED` unset (real local default) | Zero console output — confirmed safe no-op |
| `EMAIL_ENABLED=true EMAIL_PROVIDER=console` (inline override) | All 7 templates logged one line each, correct format |
| Log line includes template, role, masked recipient, ref, subject, preview | Confirmed for all 7 |
| Preview never contains the customer's name or their own enquiry message text | Confirmed — e.g. the enquiry-received line previewed the generic intro sentence, not "We'd like bulk pricing for 30 ABC colouring books..." |
| Backend `npm run build` | Passed |
| Backend `npm run lint` | Passed |
| Frontend `npm run build` | Passed (frontend untouched by this milestone; run per instruction) |

## Recommended Next Step

Wiring the email service into the real order/enquiry creation flows
(the hook points documented in `EMAIL_SETUP.md`'s "Where Emails Will
Be Triggered Later") remains a deliberately separate, future
milestone — it touches order/enquiry controller files this milestone
was instructed not to change, and per `VERSION_6_EMAIL_SERVICE_PLAN.md`
should wait until a real provider decision has been made so it can be
tested with an actual send (or at least a fully wired console-mode dry
run through the real request flows). Recommended order when that
milestone starts: order confirmation first, then admin new-order
notification, matching the priority list above.
