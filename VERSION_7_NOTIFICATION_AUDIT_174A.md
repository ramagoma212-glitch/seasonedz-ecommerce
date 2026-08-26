# Notification & Communication Architecture Audit (Milestone 174A)

Pure research audit — no code changes, no migrations, no deploys. Everything below is verified directly from the codebase at commit `2b83138` (Milestone 173A), not inferred.

## 1. The big finding: a real, tested transactional email system already exists

`backend/src/services/email/` (`email.service.ts`, `emailTemplates.ts`, `email.types.ts`, `providers/brevo.provider.ts`) — built in Milestone 117, documented in `backend/EMAIL_SETUP.md`. **Disabled by default** (`EMAIL_ENABLED=false`), but genuinely wired up, not scaffolding:

| Event | Function | Wired at | Recipient(s) |
|---|---|---|---|
| Order placed | `sendOrderCreatedEmail` + `sendAdminNewOrderEmail` | `order.controller.ts`, `createOrderHandler` | customer + admin |
| PayFast payment confirmed | `sendPaymentConfirmedEmail` | `payfast.service.ts`, `COMPLETE` case | customer |
| PayFast payment failed/cancelled | `sendPaymentFailedEmail` | `payfast.service.ts`, `FAILED`/`CANCELLED` cases | customer |
| Enquiry submitted | `sendAdminNewEnquiryEmail` + `sendEnquiryReceivedEmail` | `enquiry.controller.ts` | admin + customer |
| Password reset requested | `sendPasswordResetEmail` | `customerAuth.controller.ts` | customer |
| Payment still pending (follow-up) | `renderPaymentPendingEmail` exists | **nothing calls it** | — |

Design already in place and directly reusable for 174B:
- **Safety switches**: `EMAIL_ENABLED` (default false) → `EMAIL_PROVIDER` (`console` logs safe metadata only; `brevo` sends for real via `POST https://api.brevo.com/v3/smtp/email`).
- **Failure isolation**: every `send*Email` call site is `void sendXEmail(...).catch(() => {})` — fire-and-forget, never awaited into the response. A Brevo failure (bad key, timeout, 4xx/5xx) is caught inside `dispatch()` and logged as a warning; it can never fail an order, enquiry, or PayFast ITN.
- **Deduplication**: not generic — it rides on the idempotency already required elsewhere. PayFast's ITN handler has its own `if (order.paymentStatus === PAID) return early` guard before the `COMPLETE` branch (and equivalent guards for `FAILED`/`CANCELLED`), so `sendPaymentConfirmedEmail`/`sendPaymentFailedEmail` are structurally unreachable on a duplicate notification. Order creation is naturally one-shot (one `POST /api/orders` = one row). There is **no separate notification-level idempotency table** — the guard lives at the business-action layer.
- **PII discipline**: emails masked in logs (`j***@e***.com`), only a short non-sensitive body preview logged, never the full body/address/PayFast payload.
- **Env vars**: `EMAIL_ENABLED`, `EMAIL_PROVIDER`, `EMAIL_FROM_NAME`, `EMAIL_FROM_ADDRESS`, `ADMIN_NOTIFICATION_EMAIL`, `EMAIL_REPLY_TO`, `BREVO_API_KEY` — eagerly validated at startup exactly when needed, `RESEND_API_KEY`/`SENDGRID_API_KEY`/`SMTP_*` exist in `.env.example` as unused placeholders only.

**Not covered by this system at all**: order processing/cancelled/refunded status changes, any courier/delivery event, Bank Transfer/COD manual payment confirmation (172B.6), any affiliate lifecycle event, product review requests, digital-download-specific email (the download link already rides inside the existing payment-confirmed email for guest orders).

## 2. Everything that sends nothing today (verified, not assumed)

- **Bank Transfer / COD manual confirmation** (`adminPaymentConfirmation.service.ts`, 172B.6): zero email import. Confirming payment writes DB fields + a console audit line only.
- **Courier status sync** (`courierStatusSync.service.ts`, `courierWebhook.controller.ts`, Milestone 173/173A): zero email import. Every stage (collected/in-transit/out-for-delivery/delivered/exception/returned) only updates `Order.status`/`Shipping.status` and logs.
- **Affiliate lifecycle** (`referralAffiliate.service.ts`, `referralCommission.service.ts`, `customerAffiliate.service.ts`): zero email import anywhere. Application, approval, rejection, suspension, commission approval, payout — all portal-only; the affiliate finds out only by visiting `/account`.
- **Product reviews** (`productReview.service.ts`): zero email import. No review-request automation, no reminder.
- **Newsletter** (`newsletter.service.ts`): single opt-in, no confirmation email, **no unsubscribe route exists at all** (only a `POST /subscribe`), no campaign-send capability anywhere in the codebase — Brevo's provider file explicitly never calls a campaign/list endpoint.
- **Customer registration**: no welcome/verification email — `registerCustomer()` creates the row directly, `CustomerType.REGISTERED`, no verification step.
- **Order status admin actions** (`adminOrderStatus.service.ts` — processing/ready/cancelled transitions): no email import.

## 3. Infrastructure facts that constrain 174B/174C design

- **Zero scheduling infrastructure, confirmed twice** (Milestone 173's own audit, re-verified here): no `node-cron`/`node-schedule`/Bull/Agenda in `package.json`, no `setInterval`-based job anywhere in `backend/src`, `.github/workflows/deploy.yml` has only `push`/`workflow_dispatch` triggers (no `schedule:`), and `render.yaml` declares exactly one service (`type: web`) — no Render Cron Job, no Background Worker. **"Wait 7 days then send X" cannot be built with anything that exists today.**
- **Wishlist is 100% frontend Local Storage** (`src/js/wishlist.js`, its own header comment: "guest, frontend-only wishlist for now"), never synced to a Customer account, no server-side `Wishlist` model in the schema. Wishlist-triggered notifications are not technically possible without new architecture first.
- **No notification-shaped DB models exist**: full model list checked (`schema.prisma`) — no `Notification`, `NotificationLog`, `EmailLog`, `Message`, `Outbox`, `Job`, `Queue`, `ScheduledNotification`, `ReviewRequest`, or `StockAlert` model anywhere.
- **Low-stock detection exists but is pull-only**: `Product.lowStockThreshold` + `adminDashboard.service.ts`'s `getLowStockProducts()` already compute "is this product low" — but it's a dashboard read, never pushed anywhere. A future admin alert could reuse this comparison directly (cheapest possible win, needs no new detection logic, just a trigger point).
- **Abandoned checkout is not detectable today**: the backend only ever learns a customer's email/cart at the moment `POST /api/orders` succeeds — there is no draft-order, no server-side cart, no "checkout started" event. True abandoned-checkout recovery needs new architecture (a persisted checkout-intent record) before it's buildable at all, not just a notification hook.
- **Google Review link already exists and is already live**: `businessInfo.js`'s `googleReviewRequestUrl = "https://g.page/r/CVDIjAAjMaL7EAI/review"`, already used in the footer and a dedicated homepage `googleReviews.js` component. No owner action needed to get a link — 174C can reuse this directly.
- **WhatsApp is a contact link only**: `wa.me/27695269941` in `businessInfo.js`, used for a simple "Chat on WhatsApp" button. No Meta Cloud API, Twilio, 360dialog, or any programmatic WhatsApp-sending code anywhere.
- **No SMS infrastructure anywhere.**

## 4. Legal/consent groundwork already in place

`privacyPolicy.js` already has: a dedicated "Marketing Communications" section explicitly distinguishing transactional from marketing messages ("Transactional messages concerning an order, payment, delivery, security issue or customer enquiry are not the same as optional marketing communications"), a "Newsletter" section, general consent/unsubscribe/object-to-marketing rights, and "Email or newsletter providers" listed as a third-party processor category. **Gaps**: no mention of WhatsApp as an outbound automated channel, no mention of back-in-stock alerts, no mention of abandoned-checkout follow-up, no explicit mention of product-review-request emails (arguably covered by the existing transactional framing, but not named).

## 5. Recommended 174B event list (reuses existing infrastructure, no scheduler needed)

Already has a real trigger point today: `ORDER_PLACED`, `PAYMENT_RECEIVED`, `PAYMENT_FAILED` (existing, just needs `EMAIL_ENABLED=true` + real Brevo key), `ORDER_PROCESSING`, `ORDER_CANCELLED` (both reachable from `adminOrderStatus.service.ts`'s existing transition writes), `COURIER_BOOKED`, `COURIER_COLLECTED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `DELIVERY_EXCEPTION` (all reachable from `courierStatusSync.service.ts`'s existing outcome types — this is the cleanest new win from recent milestones), `ADMIN_NEW_ORDER`/`ADMIN_NEW_ENQUIRY` (existing), `ADMIN_NEW_REVIEW`, `ADMIN_NEW_AFFILIATE`, `ADMIN_DELIVERY_EXCEPTION` (same courier hook, admin-facing), `AFFILIATE_APPLICATION_RECEIVED`/`APPROVED`/`REJECTED`/`SUSPENDED`, `COMMISSION_APPROVED`, `PAYOUT_RECORDED`.

**Do not include in 174B** (no real trigger point exists yet): `REFUND_CONFIRMED` (Order.status REFUNDED is not currently reachable by any code path — building this notification needs the refund workflow itself first, out of scope), `READY_FOR_COLLECTION`/`COLLECTED` as distinct events (Customer Collection reuses the same `OrderStatus` enum as courier orders — no dedicated collection-specific status exists; would need explicit `deliveryMethod === COLLECTION` branching wherever `OUT_FOR_DELIVERY`/`DELIVERED` fire, not a new hook), `ADMIN_LOW_STOCK`/`ADMIN_OUT_OF_STOCK` (detection logic exists but has no synchronous trigger without a scheduler — cheapest real option is checking at the moment of order-driven stock decrement, not periodic polling), `PAYOUT_ELIGIBLE` (a state, not an event with an obvious write-time hook — would need a periodic check).

## 6. Recommended 174C event list (needs new architecture first, ranked by how much)

- `GOOGLE_REVIEW_REQUEST` / `PRODUCT_REVIEW_REQUEST`: needs a scheduler (7-day delay) — the only missing piece; the Google link and review-eligibility logic already exist.
- `ABANDONED_CHECKOUT`: needs a persisted checkout-intent record before any notification logic is meaningful.
- `BACK_IN_STOCK` / `WISHLIST_BACK_IN_STOCK`: needs a server-side Wishlist/StockWatch model tied to a Customer before any of this is technically possible.
- `CUSTOMER_NOTIFICATION_CENTRE`: no notification table/bell/history exists on `/account` today; needs the core `Notification` model 174B should introduce anyway.

## 7. Architecture recommendation (design only, not built)

A single `Notification` table (channel, templateName, recipientRef, dedupeKey, status, scheduledAt, attemptCount, lastError, sentAt) written by business-logic call sites exactly the way `email.service.ts`'s `send*Email` functions are called today — outbox-pattern, never inside the same transaction as the order/payment/courier/affiliate write it originates from, so a notification-write failure can never roll back real business state. `dedupeKey` (e.g. `order:{id}:DELIVERED`) gives generic idempotency instead of the current per-caller idempotency-by-convention. Scheduled sends (`scheduledAt`) need either a new Render Cron Job or an external scheduler hitting an authenticated backend endpoint (same secret-bearer-token pattern already proven for the courier webhook) — no in-process `setInterval` on a free-tier single web dyno, since Render can restart/sleep it.

## 8. Owner decisions needed before 174B

1. Confirm current Render values of `EMAIL_ENABLED`/`EMAIL_PROVIDER`/`BREVO_API_KEY` (not verified in this audit — no safe way to check without either dashboard access or triggering a real send).
2. Approve reusing Brevo (already integrated, zero new registration) vs. evaluating alternatives.
3. Decide scheduler approach for any 7-day-delay feature: new Render Cron Job (likely a cost/plan question) vs. external scheduler hitting a secret-authenticated endpoint (no new Render cost, same pattern as the courier webhook).
4. Confirm sender identity (`orders@seasonedzgroup.co.za` vs. continuing with the current `seasonedzgroup@outlook.com`) — a real domain sender needs DNS/DKIM/SPF setup in whatever provider is used, manual owner work either way.
