# Version 3 — QA and Release Review (Milestone 26)

A full QA, security, and release-readiness review of Version 3
(Milestones 19-25) before deciding whether to push the
`version-3-payments-delivery` branch. **This milestone changed no
application code** — it tested, reviewed, cleaned up test data, fixed
two stale documentation claims, and wrote this document.

Branch: `version-3-payments-delivery`. Latest commit before this
review: `b23b6f8` ("Prepare delivery rules and courier workflow").

## Summary of Version 3 Work

| Milestone | What it built |
|---|---|
| 19 — Payment Readiness Audit | Reviewed existing checkout/order/payment code, planned PayFast requirements, security rules, env vars, schema/frontend needs. No code changed. |
| 20 — PayFast Sandbox Setup | `PAYFAST_ENABLED` feature flag (closes a real risk: `PaymentMethod.PAYFAST` was accepted by `POST /api/orders` with no way to ever resolve it), `backend/src/config/payfast.ts`, sandbox/production process URL selection. |
| 21 — PayFast Payment Initiation | `POST /api/payments/payfast/initiate` — prepares PayFast form fields + signature from the backend's own `Order` record. Never marks anything paid. |
| 22 — PayFast ITN Verification | `POST /api/payments/payfast/notify` — the **only** code path allowed to set `paymentStatus: PAID`. Verifies signature, amount, merchant ID, order eligibility; idempotent; documented FAILED/CANCELLED `order.status` decision (stays `PENDING`, not auto-cancelled). |
| 23 — Frontend PayFast Checkout Flow | `VITE_PAYFAST_ENABLED` flag, checkout branches to PayFast, hidden POST form built from backend response only, `payment-success`/`payment-cancelled`/`payment-failed` pages (all read-only). |
| 24 — Email Preparation | `backend/src/services/email/` — templates + a console-only service. `EMAIL_ENABLED=false` by default; nothing wired to send automatically yet. |
| 25 — Delivery Rules and Courier Preparation | `backend/src/config/delivery.ts` single source of truth for the R80/R700 rule; `delivery.service.ts`; manual courier workflow documented; no courier API. |

## Test Results

### Backend QA

| Test | Result |
|---|---|
| `GET /api/health` | ✅ 200 |
| `GET /api/products` | ✅ 200, 10 products |
| `GET /api/categories` | ✅ 200, 6 categories |
| Bank transfer order, subtotal < R700 | ✅ `deliveryFee: 80` |
| Bank transfer order, subtotal ≥ R700 | ✅ `deliveryFee: 0` |
| PayFast order blocked when `PAYFAST_ENABLED=false` | ✅ clean `400` |
| PayFast order allowed when `PAYFAST_ENABLED=true` | ✅ `201`, order created |
| Initiate: missing `orderNumber` | ✅ `400` |
| Initiate: invalid `orderNumber` format | ✅ `400` |
| Initiate: unknown `orderNumber` | ✅ `404` |
| Initiate: wrong payment method (bank transfer order) | ✅ `400` |
| Initiate: valid PayFast order | ✅ `200`, fields + signature returned |
| Payment status remains `PENDING` after initiation | ✅ confirmed |
| Notify: missing fields | ✅ `400`, names missing fields |
| Notify: invalid signature | ✅ `403` |
| Notify: wrong amount (correctly signed) | ✅ `400` |
| Notify: wrong merchant ID | ✅ `400` |
| Notify: unknown order | ✅ `404` |
| Notify: valid `COMPLETE` | ✅ `200`, order → `PAID`/`CONFIRMED` |
| Notify: duplicate `COMPLETE` | ✅ `200`, no change, no duplicate write |
| Notify: `FAILED` | ✅ `200`, `paymentStatus: FAILED`, `order.status` stayed `PENDING` |
| Notify: `CANCELLED` | ✅ `200`, `paymentStatus: CANCELLED`, `order.status` stayed `PENDING` |
| Stock unaffected by any notify call | ✅ confirmed via product stock check |
| No secrets in backend logs | ✅ confirmed across all test runs |

### Frontend QA

**`VITE_PAYFAST_ENABLED=false`:**

| Test | Result |
|---|---|
| PayFast option disabled, "Coming Soon" | ✅ |
| Bank transfer checkout | ✅ |
| Order confirmation | ✅ |
| Order tracking | ✅ |
| Contact / Schools / Wholesale / Distributor forms | ✅ all 4 submitted successfully |
| Console errors | ✅ none |

**`VITE_PAYFAST_ENABLED=true`:**

| Test | Result |
|---|---|
| PayFast option selectable | ✅ |
| PayFast checkout creates order | ✅ |
| `POST /api/payments/payfast/initiate` called | ✅ |
| Hidden POST form built to PayFast sandbox `processUrl` | ✅ confirmed real `POST` to `sandbox.payfast.co.za` |
| Frontend does not generate the signature | ✅ confirmed byte-identical to the `/initiate` response's signature |
| `payment-success` reads backend status | ✅ shows "being verified" while `PENDING` |
| `payment-cancelled` reads backend status | ✅ loads with order number |
| `payment-failed` reads backend status | ✅ loads with order number |
| No frontend page marks payment as paid | ✅ `paymentStatus` confirmed still `PENDING` after visiting all three pages |
| Delivery: below R700 shows R80 | ✅ |
| Delivery: R700+ shows Free | ✅ |
| Order confirmation delivery display | ✅ |
| Tracking page does not claim live courier tracking | ✅ ("not a live courier... updated manually by Seasonedz Group") |
| Console errors | ✅ none |

### Email Preparation QA

| Test | Result |
|---|---|
| `EMAIL_ENABLED` defaults to `false` | ✅ |
| Backend starts without email credentials | ✅ |
| Templates render with mock data | ✅ all render without throwing |
| Console mode masks recipient email | ✅ e.g. `q***@e***.com` |
| No real email sending | ✅ confirmed — no provider integrated, `console` mode only logs metadata |

## Security Review

- **Frontend never decides payment success** — only `POST /api/payments/payfast/notify`, after independent verification, can set `paymentStatus: PAID`. Confirmed by code review (no other write path) and by test (visiting all three payment pages never changed status).
- **Signature verification** — PayFast's custom-integration algorithm, compared with `crypto.timingSafeEqual`. A single-byte-tampered signature is rejected (`403`). The raw signed string and the signature itself are never logged.
- **Amount verification** — `amount_gross` is compared against the stored `Order.total` as a `Prisma.Decimal`, never trusted from the notification alone.
- **Merchant ID check** — an independent check before signature verification, defense-in-depth beyond the signature alone.
- **PayFast secrets** — `merchant_id`/`merchant_key`/`passphrase` are read only from backend env vars (`src/config/payfast.ts`), never referenced anywhere in frontend code, never in a `VITE_`-prefixed variable, never returned in any API response (only the computed `signature` is).
- **Email** — no credentials required while disabled; console-mode logging never includes rendered body, full email address, or personal details.
- **Rate limiting** — `POST /api/payments/payfast/initiate` has its own limiter (10/15min/IP); `/notify` deliberately has none beyond the general API limiter, since it's a server-to-server webhook that may legitimately retry.

## Production Safety Status

| Check | Result |
|---|---|
| `PAYFAST_ENABLED` defaults to `false` | ✅ (`backend/src/config/env.ts`) |
| `VITE_PAYFAST_ENABLED` defaults to `false` | ✅ (`.env.example`) |
| Production frontend build won't show active PayFast unless explicitly enabled | ✅ — `.github/workflows/deploy.yml` only sets `VITE_API_BASE_URL`, never `VITE_PAYFAST_ENABLED`; the code defaults to `false` when unset |
| Production backend won't initiate PayFast unless explicitly enabled | ✅ in code (defaults `false`); **actual live Render dashboard state cannot be verified from here** (no dashboard access) — same known gap as the Version 2 stability review |
| No PayFast passphrase exposed to frontend | ✅ confirmed — no reference anywhere in `src/` |
| No PayFast secret tracked in git | ✅ confirmed — `.env` files git-ignored, never committed, `.env.example` placeholder-only |
| No `DATABASE_URL`/`DIRECT_URL` tracked in git | ✅ confirmed — searched full git history, no real connection string ever committed |
| No `.env` files tracked | ✅ confirmed via `git ls-files` |
| `.env.example` files contain placeholders only | ✅ confirmed, both root and backend |

## PayFast Source IP Verification Warning

**Confirmed: source IP verification is documented as a known gap in `backend/PAYFAST_SETUP.md` and is not implemented.** This was a deliberate decision (Milestone 22), not an oversight — it can't be meaningfully tested locally, and a fake/unexercised check would be worse than an honest gap. Signature verification is the primary defence in the meantime.

**This means:**
- Sandbox testing can continue safely as-is.
- **Real live payment launch should not happen until source IP verification (or another PayFast-recommended production validation) is implemented.** This is not faked anywhere in this codebase.

## Email Status

Prepared, not wired. Templates and a console-only service exist and are tested; `EMAIL_ENABLED=false` by default; no provider is integrated; nothing in `order.controller.ts`, `payfast.service.ts`, or `enquiry.controller.ts` calls the email service automatically (hook points are documented in `backend/EMAIL_SETUP.md`, not implemented).

## Courier Status

Entirely manual. `COURIER_INTEGRATION_ENABLED = false` (hardcoded — not even an env flag yet, since there's nothing to enable). No Courier Guy/PUDO/Bob Go code, credentials, or API calls anywhere. Future options and env var placeholders are documented in `backend/DELIVERY_SETUP.md`.

## Delivery Rules

Unchanged rule: **R80 standard delivery, free from a R700 subtotal.** Single backend source of truth is now `backend/src/config/delivery.ts`. Confirmed correct via testing at both the backend (order creation) and frontend (checkout display, order confirmation) layers.

## Known Limitations

- Source IP verification not implemented (see above) — the main blocker for real production PayFast use.
- No real end-to-end round trip through PayFast's actual hosted sandbox payment page has been performed — testing has inspected the generated form and exercised pages directly, not completed a real sandbox payment start to finish.
- No email provider integrated; no email sends automatically yet.
- No courier API; tracking is a manually-set backend status, never live.
- No login, customer accounts, or admin dashboard (unchanged from Version 2 — out of scope for all of Version 3 so far).
- The live Render backend's actual current `PAYFAST_ENABLED`/`EMAIL_ENABLED` dashboard state cannot be verified from this session (no dashboard access) — code defaults are safe regardless.

## Database Cleanup Result

Final state after this review's testing: **6 categories, 10 products, 1 order, 0 enquiries.** The 1 remaining order (`SG-2026-28SM`, customer "Anani Ramagoma") is the same order flagged during the Version 2 Live Stability Review as likely a real customer record, not test data — left untouched again this time. All test orders and enquiries created during this review (9 orders across Milestone 26's own testing, plus 2 orders found left over from an earlier crashed Milestone 25 test run) were deleted by precise order number/email, and stock was restored for every deleted order.

## Recommendations

- **Ready to push the branch? Yes.** All QA passed, no secrets are tracked, documentation is accurate, and the working tree is clean. Pushing only publishes the branch — it does not deploy or merge anything.
- **Ready to merge into main? Not yet recommended without an explicit decision from you.** The code is safe (everything stays inert by default), but merging to `main` is typically followed by a deploy in this project's workflow — confirm that's not about to happen automatically before merging.
- **Ready for real live payments? No.** Source IP verification is not implemented, no real end-to-end PayFast sandbox round trip has been completed, and no live PayFast credentials should be used until both of those are addressed.
