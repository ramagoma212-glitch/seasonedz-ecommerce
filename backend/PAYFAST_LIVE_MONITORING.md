# PayFast Live Monitoring Checklist (Version 7, Milestone 125)

PayFast is now live on the customer checkout. A real payment test
(order `SG-2026-2NN7`) succeeded end to end — checkout, redirect,
real payment, PayFast ITN, `paymentStatus: PAID`. This document is an
**operations checklist for the business owner**, not a technical
document — no code knowledge is needed to follow it.

## Who Gets Alerts

- **Admin new order / new enquiry alerts:** `nedzamb1a@gmail.com`
- **Emails are sent from:** `Seasonedz Group <orders@seasonedzgroup.co.za>`
- **Replies go to:** `seasonedzgroup@outlook.com`

## Daily Checks (First 7 Days)

Do these once a day, every day, for the first week PayFast is live:

- [ ] Check the admin dashboard's Orders list for anything new.
- [ ] Confirm every new PayFast order shows `paymentStatus: PAID`
      (not stuck on `PENDING`).
- [ ] Log into the PayFast merchant dashboard and confirm its list of
      payments matches the website's PayFast orders — same amounts,
      same rough timing, no payment PayFast shows that the website
      doesn't have.
- [ ] Confirm the admin new order alert email arrived for each order
      (to `nedzamb1a@gmail.com`).
- [ ] Confirm the customer payment-confirmation email arrived for
      each paid PayFast order.
- [ ] Note any customer order-confirmation email that bounces (see
      "If a customer order-confirmation email bounces" below) — this
      is separate from the payment-confirmation email and known to
      have bounced once already during testing.
- [ ] Confirm there are no duplicate payments for the same order.
- [ ] Confirm no order is stuck on `PENDING` for a payment that
      clearly succeeded on PayFast's side.
- [ ] If using Courier Guy, only pull a **quote** — never click
      **Book Courier** unless you're deliberately, knowingly booking
      a real shipment for a real order.

## For Every New PayFast Order

Work through this list for each individual new PayFast order:

- [ ] The order appears in the admin dashboard.
- [ ] `paymentStatus` is `PAID`.
- [ ] Payment method shown is `PAYFAST`.
- [ ] The order total matches the amount PayFast shows for that
      payment.
- [ ] Item quantities and the delivery fee look correct.
- [ ] Customer name, contact and delivery details are present.
- [ ] `fulfilmentStatus` is `NOT_STARTED` until you've actually
      started preparing the order — this is normal and expected; it
      does not mean anything is wrong.
- [ ] No courier booking was created automatically — booking is
      always a separate, deliberate action you take manually later.
- [ ] Once the order actually ships, add courier tracking manually
      (or book via Courier Guy deliberately, if that's how you're
      shipping it).

## If a Payment Appears in PayFast But the Website Order Is Not PAID

**Do not ship the order.** Work through this instead:

1. Check the payment's status directly in the PayFast dashboard.
2. Check the same order's payment status in the admin dashboard.
3. Ask for a technical check of Render's backend logs for a PayFast
   ITN (notification) matching that order/payment.
4. Escalate for a technical review if the mismatch isn't quickly
   explained.
5. **Never manually mark an order as paid** unless the payment has
   been independently verified on PayFast's own dashboard first.

## If a Customer Says They Paid But Their Order Shows PENDING

1. Ask the customer for their PayFast payment reference or a
   screenshot of their PayFast confirmation.
2. Check that reference against the PayFast merchant dashboard.
3. Check the order in the admin dashboard.
4. Check the order's payment record.
5. Only proceed with shipping once payment is genuinely confirmed —
   never ship on the customer's word alone.

## If a Customer Order-Confirmation Email Bounces

This already happened once during the live payment test — the
customer's own "order received" email bounced in Brevo, while the
admin alert and the payment-confirmation email to the same customer
both arrived fine. That pointed to an isolated delivery issue, not a
website problem, but it's worth watching:

1. Check Brevo's Transactional Logs for that specific send — it will
   show whether it was blocked, bounced, or delivered.
2. Confirm the *admin* alert and the *payment-confirmation* email for
   the same order both arrived — if they did, the sending system
   itself is working; it's a delivery issue for that one message.
3. If the customer clearly never got their confirmation, contact them
   manually (phone, WhatsApp, or a direct email) so they're not left
   wondering whether their order went through.
4. Keep a note of how often this happens. One bounce during a single
   test isn't a pattern.
5. If it starts happening repeatedly across different customers,
   that's worth a proper deliverability investigation (sender
   reputation, domain warm-up, spam filtering) — not something to
   guess at from a single occurrence.

## Safe Rollback (If Something Goes Wrong)

If PayFast needs to be turned off quickly for any reason:

1. In Render, set `PAYFAST_ENABLED=false`.
2. In GitHub Actions (`.github/workflows/deploy.yml`), set
   `VITE_PAYFAST_ENABLED: "false"`.
3. Redeploy.
4. Confirm the live checkout page shows PayFast as "Coming Soon"
   again.
5. Confirm `POST /api/payments/payfast/initiate` returns `503` again.
6. Bank Transfer stays available as a fallback payment method
   throughout — this rollback never removes it.

## What Not To Do

- Do not paste PayFast credentials (Merchant ID, Merchant Key,
  Passphrase) into any chat, including this one.
- Do not paste the Brevo API key into any chat, including this one.
- Do not manually change an order's payment status to `PAID` without
  independently verifying the payment on PayFast's own dashboard
  first.
- Do not ship an order that isn't confirmed paid.
- Do not enable Courier Guy booking unless you're deliberately
  testing or booking a real shipment.
- Do not delete a paid order.

## Recommended Monitoring Period

- **First 7 days:** check daily, using the "Daily Checks" list above.
- **First 10 PayFast orders:** check each one carefully against the
  "For Every New PayFast Order" list above, even after the first 7
  days have passed if fewer than 10 orders have come in yet.
- **After that**, once orders are coming in smoothly and nothing
  unusual has shown up, this folds into your normal day-to-day admin
  order checks — no special extra process needed.
