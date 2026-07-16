# Version 4 Live Stability Review

A short post-deployment check confirming that the live production site
and API are stable after the Version 4 merge (main at
`b711cb8815c60f764b930c0fdddf27a07f867d8a`), and that every safety flag
is still in its intended off/disabled state. No code was changed as
part of this review — it is verification only.

- **Live frontend:** https://ramagoma212-glitch.github.io/seasonedz-ecommerce/
- **Live backend:** https://seasonedz-ecommerce.onrender.com/api

## What Was Tested

All testing was done directly against the live, deployed site and API
(no local servers involved), using a real browser (Playwright) for the
frontend and direct HTTP requests for the backend.

**Frontend pages/features** — all loaded and worked correctly:
Homepage, Shop, Categories, Search, Product details, Cart, Wishlist,
Bank Transfer checkout, Order confirmation, Order tracking, Contact
form, Schools form, Wholesale form, Distributor form, Mobile menu.

- A real guest order was placed end-to-end (Bank Transfer, one unit of
  "School Starter Colouring Pack"), redirected to Order Confirmation,
  and looked up again on Order Tracking — all backed by real API calls
  to the live backend, not static/demo data.
- All four enquiry forms (Contact/Schools/Wholesale/Distributor) were
  submitted and each returned a real backend-issued reference ID.
- Zero browser console errors across the entire session.
- Every `/api/` request observed (11 total) went only to
  `seasonedz-ecommerce.onrender.com` — none to `localhost`, none to any
  other host.

## PayFast Disabled Confirmation

Confirmed on the live checkout page:

- The PayFast radio input has the `disabled` HTML attribute set — it
  cannot be selected.
- Its label reads **"PayFast (Coming Soon)"**, with the description
  "Real PayFast integration is not connected yet."
- A guest customer cannot reach a PayFast flow through the UI at all;
  Bank Transfer and Cash/Card on Delivery are the only selectable
  options.

Confirmed on the live backend:

- `POST /api/payments/payfast/initiate` returns HTTP `503` with
  `{ "success": false, "message": "PayFast payments are not enabled." }`
  — the route exists and is reachable, but is safely gated. It does
  **not** return "Route not found", confirming Version 4's payment code
  is deployed and correctly inert.

## Backend Version 4 Route Confirmation

| Route | Result |
|---|---|
| `GET /api/health` | `200`, `environment: "production"`, no secrets in response |
| `GET /api/products` | `200` |
| `GET /api/categories` | `200` |
| `POST /api/payments/payfast/initiate` | `503`, safe disabled message (see above) |

## Delivery Rule Confirmation

Checked directly on the live checkout page, both branches of the rule:

- **Subtotal below R700** (1 × R459.00 item): Delivery shown as
  **R80.00**, Order Total R539.00 — confirmed both on the checkout
  order summary and again on the real Order Confirmation page after
  placing the order.
- **Subtotal at/above R700** (2 × R459.00 = R918.00): Delivery shown as
  **Free**, Order Total R918.00 — confirmed on the checkout order
  summary (this cart state was not submitted as an order; only the
  R459/R80 cart was actually checked out, to avoid creating a second
  test order).
- **Order Tracking** does not claim live courier tracking. It
  explicitly states: *"Tracking is a Seasonedz Group backend status,
  not a live courier"* and *"There is no real courier integration yet —
  this status is updated manually by Seasonedz Group, not by a live
  courier API."*

## Email Inactive Confirmation

Real email sending remains inactive in production. This is based on:

- `EMAIL_ENABLED` defaults to `false` in code (`backend/src/config/env.ts`)
  and was confirmed not set on Render during the Version 4 pre-merge
  safety review.
- No email-provider credentials (`RESEND_API_KEY`, `SENDGRID_API_KEY`,
  `SMTP_*`) are configured; no provider is integrated in the code.
- Placing the real test order and submitting all four enquiry forms
  during this review triggered no visible email-sending behaviour.

This review does not have access to a real inbox, so it cannot directly
observe "no email arrived" — the confirmation above rests on
configuration and prior confirmation, not on checking an inbox.

## Database Cleanup Result

One real test order and four test enquiries were created during this
review's live testing, all under `m4stability@example.com`, and all
were deleted afterward:

- Order `SG-2026-42HN` (Bank Transfer, 1 × School Starter Colouring
  Pack) — deleted.
- 4 enquiries (Contact, Schools, Wholesale, Distributor) — deleted.
- Stock on "School Starter Colouring Pack" restored by exactly +1
  (45 → 46), matching the single unit the test order had decremented.
- `SG-2026-28SM` confirmed still present and untouched.
- A final database check confirmed zero remaining
  `example.com`-pattern orders or enquiries.

## Known Limitations

- PayFast remains disabled in production (`PAYFAST_ENABLED` /
  `VITE_PAYFAST_ENABLED` both unset/false) — no live payments can be
  taken yet.
- Source verification's acceptance path is still unproven in a hosted
  environment (only its rejection path has been proven live) — see
  `VERSION_4_QA_PRODUCTION_READINESS_REVIEW.md`.
- Retry-while-PENDING still carries a possible duplicate-payment risk
  if a customer submits two retries in quick succession before the
  first's ITN arrives — documented, not yet mitigated.
- No real email provider is connected — order/enquiry emails are
  prepared (templates + console-only service) but do not send.
- No real courier API is connected — order tracking is a manually
  updated backend status, not live carrier tracking.

## Recommendation for Version 5

Version 4 is stable in production: the site, checkout, order tracking,
and all four enquiry forms work correctly end-to-end against the live
backend, and every payment/email safety flag remains in its intended
off state. Version 5 should pick from, but is not obligated to resolve
all of, the known limitations above — the two most consequential are
resolving PayFast's unproven acceptance path (needed before any real
production PayFast payment can be taken) and deciding how to close the
retry-while-PENDING duplicate-payment gap. Connecting a real email
provider is lower-risk and could reasonably ship independently of the
PayFast decision.
