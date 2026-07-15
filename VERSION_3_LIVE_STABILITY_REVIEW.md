# Version 3 Live Stability Review

A post-merge, post-deployment stability check confirming Version 3 is
live, stable, and safe in production — run against the real live
frontend and backend (not a local or staging environment).

**Live frontend:** https://ramagoma212-glitch.github.io/seasonedz-ecommerce/
**Live backend:** https://seasonedz-ecommerce.onrender.com/api

**Main branch commit at time of review:** `40290b2` ("Merge
version-3-payments-delivery into main: Version 3 (PayFast payments,
email prep, delivery/courier prep)").

## What Was Tested

**Backend (direct requests to the live URL):**
- `GET /api/health`
- `GET /api/products`
- `GET /api/categories`
- `POST /api/payments/payfast/initiate` (confirming the Version 3
  route exists and is safely disabled)

**Frontend** (real headless-browser session against the live GitHub
Pages URL, `main` branch build):
- Homepage (product rails), Shop, Categories, Search, Product Details
- Cart, Wishlist
- Full checkout → order confirmation → order tracking (bank transfer,
  both below- and at/above-R700 delivery scenarios)
- PayFast selectability (confirming it's disabled)
- Contact, Schools, Wholesale, Distributor enquiry forms
- Mobile menu (375×812 viewport)
- Every network request made during the session, to confirm they all
  reach the live Render backend and never `localhost` or anywhere else
- Browser console, for any errors

## Results

**Backend:**
- `GET /api/health` → `200`, `{"success":true,...,"environment":"production",...}`. No secrets in the response.
- `GET /api/products` → `200`, `count: 10`.
- `GET /api/categories` → `200`, `count: 6`.
- `POST /api/payments/payfast/initiate` → `503`,
  `{"success":false,"message":"PayFast payments are not enabled."}`.

**Frontend:** every page and flow tested loaded and worked correctly:

| Check | Result |
|---|---|
| Homepage product rails | ✅ 11 cards across the three rails |
| Shop | ✅ 10 products |
| Categories | ✅ 6 categories |
| Search (`?q=abc`) | ✅ 3 matching results |
| Product details | ✅ correct product loaded |
| Cart | ✅ add-to-cart works, badge updates |
| Wishlist | ✅ toggle works, badge updates |
| Bank transfer checkout (below R700) | ✅ order created, `R80.00` delivery fee shown at checkout and on order confirmation |
| Bank transfer checkout (R700+) | ✅ order created, `Free` delivery shown at checkout and on order confirmation |
| Order confirmation | ✅ real order data shown, correct delivery fee both times |
| Order tracking | ✅ real tracking data shown, honest "not a live courier" wording present |
| Contact form | ✅ submitted, reference number shown |
| Schools form | ✅ submitted, reference number shown |
| Wholesale form | ✅ submitted, reference number shown |
| Distributor form | ✅ submitted, reference number shown |
| Mobile menu | ✅ opens correctly |

## PayFast Disabled Confirmation

Confirmed on the live site directly:

- The PayFast radio button on checkout has the `disabled` HTML
  attribute set — a real customer cannot click/select it. (Attempting
  to force-check it via a script confirms the browser's native
  disabled-input behaviour prevents real selection either way — this
  isn't just a visual/CSS disable.)
- Its label reads "PayFast (Coming Soon)" — no misleading "active"
  wording.
- On the backend, `POST /api/payments/payfast/initiate` returns a
  clean `503`: `"PayFast payments are not enabled."` — the Version 3
  route exists (confirmed — it does **not** return "Route not found"),
  but `PAYFAST_ENABLED` is `false`/unset in the live Render
  environment, exactly as required. **PayFast cannot be used by a real
  customer anywhere in production today.**

## Backend Version 3 Route Confirmation

`POST /api/payments/payfast/initiate` exists in the deployed backend
(the route itself resolves — no `404 Route not found`) and correctly
refuses to do anything because it's disabled (`503`, safe message, no
order lookup or signature generation occurs). This confirms Render is
now running the merged Version 3 code, and that the safety gate
(`PAYFAST_ENABLED`) is doing its job in the live environment.

## Delivery Rule Confirmation

Confirmed live, both directions:

- A cart below R700 subtotal → **R80.00** delivery fee, shown
  correctly at checkout and on the resulting order confirmation.
- A cart at/above R700 subtotal → **Free** delivery, shown correctly
  at checkout and on the resulting order confirmation.
- Order tracking does not claim live courier tracking — the existing
  honest "not a live courier... updated manually by Seasonedz Group"
  wording is present and unchanged.

## Email Inactive Confirmation

**No real email was sent during this review's test orders or
enquiries.** Two independent reasons support this:

1. **Code-level:** the email service (`backend/src/services/email/`)
   is not called from anywhere in the order-creation, PayFast
   ITN-verification, or enquiry-creation code paths — confirmed by
   code review during Milestone 24/26 and unchanged since. No email
   send could fire from this review's test activity regardless of any
   env var.
2. **Config-level:** `EMAIL_ENABLED` defaults to `false` in code
   (`backend/src/config/env.ts`) unless explicitly set otherwise. I
   have no way to directly inspect Render's dashboard from this
   session, but nothing in this review's testing produced any
   evidence of an email being sent (no visible side effects, no
   bounced-mail-style errors, consistent with `EMAIL_ENABLED` being
   `false`/unset there too).

## API Calls Confirmed Going to Render

Every request observed during the session (11 in total, across
product/category loads, order creation, order lookup, order tracking,
and enquiry submissions) went to
`https://seasonedz-ecommerce.onrender.com/api/...` — none to
`localhost` or anywhere else.

**Console errors:** none, throughout the entire session.

## Database Cleanup Result

After testing, Supabase was checked directly:

- **6 categories** ✅
- **10 products** ✅
- Test data created by this review — two orders (`SG-2026-WHGQ` below
  R700, `SG-2026-WG8P` R700+) and four enquiries (Contact/Schools/
  Wholesale/Distributor, all using clearly-marked test emails) — were
  deleted using their exact IDs, and stock was restored for both
  orders.
- **`SG-2026-28SM` was explicitly not touched**, per instruction —
  this is the same order flagged in the Version 2 Live Stability
  Review and again during Milestone 26 QA as likely a real customer
  record, not test data.
- **Final state after cleanup: 6 categories, 10 products, 1 order
  (`SG-2026-28SM`, intentionally untouched), 0 enquiries.**

## Known Limitations

- **PayFast is still disabled in production** — `PAYFAST_ENABLED` is
  `false`/unset on the live Render backend and `VITE_PAYFAST_ENABLED`
  is explicitly `false` in the GitHub Actions production build. This
  is intentional, not a bug.
- **Source IP verification is not implemented yet** for the PayFast
  ITN endpoint — documented in `backend/PAYFAST_SETUP.md` as a known
  gap, not faked.
- **No real hosted PayFast sandbox round trip has been completed
  yet** — all PayFast testing so far (local and pre-merge) has
  exercised the API directly or inspected the generated redirect form;
  no one has completed an actual payment on PayFast's own hosted
  sandbox page and followed it back through `return_url`/`notify_url`.
- **Email provider is not connected yet** — templates and a
  console-only logging service exist (Milestone 24), but no real
  provider (Resend/SendGrid/SMTP) is integrated, and nothing calls the
  email service automatically from any request flow.
- **Courier API is not connected yet** — fulfilment and tracking
  remain entirely manual; `COURIER_INTEGRATION_ENABLED` is hardcoded
  `false` in code, and there is no courier provider integration
  anywhere in this codebase.
- Unchanged from the Version 2 review: no login, customer accounts, or
  admin dashboard; rate limiting is in-memory per Render instance; no
  automated test suite (all verification, including this review, is
  manual); Render's free-tier services can spin down after inactivity.

## Confirmation

**Version 3 is stable and safe in production.** Every tested flow —
browsing, cart, wishlist, bank-transfer checkout (both delivery-fee
scenarios), order confirmation, order tracking, and all four enquiry
forms — works correctly against the live Render backend from the live
GitHub Pages frontend, with no console errors and no unexpected
failures. PayFast is confirmed present in the deployed code but fully
inactive everywhere a real customer could reach it. Email sending is
inactive. Secrets remain safe (no credentials in any tracked file).

## Recommendation for Version 4

Version 3 successfully and safely ships PayFast payment
infrastructure, email preparation, and delivery/courier groundwork
without activating any of them for real customers. Recommended next
steps for a Version 4 (in priority order, each as its own scoped
milestone rather than all at once):

1. Complete one real, hosted PayFast sandbox round trip (a genuine
   test payment through PayFast's own UI, followed back through
   `return_url` and a real `notify_url` delivery) before considering
   enabling PayFast for real customers.
2. Implement source IP verification on the ITN endpoint as the
   remaining PayFast production-readiness gap.
3. Only after both of the above: a deliberate, separately-reviewed
   decision to set `PAYFAST_ENABLED=true` in production with real
   merchant credentials.
4. Choose and integrate a real email provider (Resend is the simplest
   option already documented) and wire the already-built email service
   into the order/payment/enquiry flows.
5. Courier integration remains a good later candidate once payments
   and email are live and stable.
