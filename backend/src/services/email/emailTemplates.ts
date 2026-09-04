// Email template rendering (Version 3, Milestone 24 — preparation
// only; Version 7, Milestone 117 — wired to a real send via Brevo,
// still off by default). Plain-text bodies, kept simple, professional
// and warm rather than salesy — South African English throughout
// ("colouring", not "coloring"). Nothing here sends anything itself;
// see email.service.ts.
//
// No fake bank account details are ever included — a BANK_TRANSFER
// order gets an honest "Seasonedz Group will follow up directly" line
// until real banking details are safely configured somewhere (not
// part of this milestone; a future milestone would add them via
// Render env, never hardcoded here).

import type {
  AbandonedCheckoutEmailData,
  AdminDeliveryExceptionEmailData,
  AdminInvitationEmailData,
  AdminNewReviewEmailData,
  AdminOtpEmailData,
  AdminPasswordResetEmailData,
  AffiliateApplicationActionRequiredEmailData,
  AffiliateApplicationSubmittedEmailData,
  AffiliateEmailData,
  CommissionEmailData,
  EnquiryEmailData,
  OrderEmailData,
  OrderEmailItem,
  PasswordResetEmailData,
  PayoutEmailData,
  ProductReviewRequestEmailData,
  RenderedEmail,
  StockAlertEmailData,
} from "./email.types.js";
import { preferredFrontendBaseUrl } from "../../utils/frontendUrl.js";
import { formatSastDate } from "../../utils/southAfricaTime.js";

const CONTACT_LINE = "If you have any questions, just reply to this email or reach us through our Contact page.";

// Version 7, Milestone 117: explicit contact details for the
// order-created customer email specifically — the same real,
// already-public WhatsApp number used everywhere else on the site,
// and the reply-to inbox this email's own "Reply" button actually
// reaches (Brevo's replyTo, set to this same address).
//
// Version 7, Milestone 134: WhatsApp number updated to match the new
// public number (src/data/businessInfo.js). The email stays as
// seasonedzgroup@outlook.com — matching both EMAIL_REPLY_TO (Brevo's
// actual replyTo) and the public site's own contact email, which is
// also still outlook.com for now (info@seasonedzgroup.co.za has no
// mailbox yet — see businessInfo.js). Update this once EMAIL_REPLY_TO
// itself moves to a real, tested info@ mailbox, not before, or a
// customer's "Reply" would go somewhere unmonitored.
const ORDER_CONTACT_BLOCK = `Seasonedz Group
Email: seasonedzgroup@outlook.com
WhatsApp: +27 69 526 9941`;

function formatRand(amount: number): string {
  return `R${amount.toFixed(2)}`;
}

function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Milestone 181, Part O: identifies each preorder line, its release
// date (South African time, never a raw UTC timestamp — Part T), and
// the exact Rand amount the first-preorder discount took off it, if
// any. Never claims a delivery date — "Available from", matching the
// customer-facing wording elsewhere (Part S/N).
function formatItemsList(items: OrderEmailItem[]): string {
  return items
    .map((item) => {
      const base = `- ${item.productName} x${item.quantity}: ${formatRand(item.lineTotal)}`;
      if (!item.isPreorder) return base;
      const releaseNote = item.preorderReleaseAt ? ` Preorder, available from ${formatSastDate(item.preorderReleaseAt)}.` : " Preorder.";
      const discountNote = item.preorderDiscountAmount ? ` First preorder discount applied: -${formatRand(item.preorderDiscountAmount)}.` : "";
      return `${base}${releaseNote}${discountNote}`;
    })
    .join("\n");
}

// Milestone 181, Part K/O: the ship-together fulfilment notice — shown
// only when the order actually contains a preorder item. Never promises
// delivery ON the release date itself; the release date only ends the
// fulfilment hold (Part R).
function preorderFulfilmentNotice(order: OrderEmailData): string {
  if (!order.containsPreorder) return "";
  const releaseNote = order.latestPreorderReleaseAt ? ` Available from ${formatSastDate(order.latestPreorderReleaseAt)}.` : "";
  return `\n\nThis order contains a preorder item.${releaseNote} All physical items in this order will be dispatched together once the preorder item is available.`;
}

// Version 7, Milestone 168C: labels for the three owner-approved
// fulfilment methods stored on Order.deliveryMethod.
function formatDeliveryMethodLabel(method: string): string {
  switch (method) {
    case "COURIER_LOCKER":
      return "Courier Guy Locker to Locker";
    case "COURIER_DOOR":
      return "Courier Guy Door to Door";
    case "COLLECTION":
      return "Customer Collection";
    default:
      return method ? humanizeEnum(method) : "Delivery";
  }
}

// Version 7, Milestone 168C: Customer Collection has no physical
// delivery address at all — showing the courier address block for it
// would be both wrong (the fields are null) and misleading (it isn't
// being couriered). Branches on deliveryMethod instead of just
// checking for missing fields, so the wording is always intentional.
// Version 7, Milestone 168C.1: Courier Guy Locker to Locker has no
// real locker-picker yet either — only city/province are ever
// collected for it (streetAddress/suburb/postalCode are always null),
// so this adds its own clarifying line rather than silently rendering
// a shorter, unexplained address block.
function formatDeliveryNote(order: OrderEmailData): string {
  if (order.deliveryMethod === "COLLECTION") {
    return `Collection location: ${order.collectionCity ?? "to be confirmed"}\nCollection is by arrangement. We'll be in touch to confirm details.`;
  }

  if (order.deliveryMethod === "COURIER_LOCKER") {
    const lines = [`Area: ${order.deliveryCity ?? ""}, ${order.deliveryProvince ?? ""}`.trim(), "Nearest Courier Guy locker to be arranged and confirmed before dispatch."];
    if (order.deliveryNotes) lines.push(`Notes: ${order.deliveryNotes}`);
    return lines.filter(Boolean).join("\n");
  }

  const lines = [
    order.deliveryStreetAddress,
    order.deliverySuburb,
    order.deliveryCity || order.deliveryProvince || order.deliveryPostalCode
      ? `${order.deliveryCity ?? ""}, ${order.deliveryProvince ?? ""} ${order.deliveryPostalCode ?? ""}`.trim()
      : null,
  ];
  if (order.deliveryNotes) lines.push(`Notes: ${order.deliveryNotes}`);
  return lines.filter(Boolean).join("\n");
}

// Version 7, Milestone 168C: replaces the old one-size-fits-all
// "Delivery is arranged manually..." courier line — Customer
// Collection orders must never see courier/tracking wording (Part 32).
function deliveryFulfilmentNote(order: OrderEmailData): string {
  if (order.deliveryMethod === "COLLECTION") {
    return "Collection is by arrangement. We'll be in touch to confirm collection details once your order is confirmed.";
  }
  return "Delivery is arranged manually by our small team once your order is confirmed. We'll be in touch with tracking details once it's packed and booked.";
}

// Version 7, Milestone 117: the BANK_TRANSFER line no longer implies
// any specific banking detail exists to share yet — no real bank
// account has been configured anywhere in this codebase, and none is
// invented here. This says only that Seasonedz Group will follow up
// directly, which is both honest and safe regardless of when real
// banking details are eventually added (a future milestone, via
// Render env if needed — never hardcoded).
function paymentInstructions(paymentMethod: string): string {
  switch (paymentMethod) {
    case "BANK_TRANSFER":
      return "Seasonedz Group will confirm payment details and next steps with you directly.";
    case "PAYFAST":
      return "Your PayFast payment is being processed. We'll email you again as soon as it's confirmed.";
    case "CASH_ON_DELIVERY":
      return "You'll pay by cash or card when your order is delivered.";
    default:
      return "Seasonedz Group will be in touch with next steps for payment.";
  }
}

// Version 6, Milestone 53: short, honest framing per enquiry type for
// the customer-facing "we received your message" email. Uses the same
// enquiry.type values as the admin notification template, so both
// stay in sync automatically if a new EnquiryType is ever added.
function enquiryTypeIntro(type: string): string {
  switch (type) {
    case "SCHOOL":
      return "Thank you for your school enquiry with Seasonedz Group.";
    case "WHOLESALE":
      return "Thank you for your wholesale enquiry with Seasonedz Group.";
    case "DISTRIBUTOR":
      return "Thank you for your interest in becoming a Seasonedz Group distributor.";
    case "CONTACT":
    default:
      return "Thank you for contacting Seasonedz Group.";
  }
}

// Version 7, Milestone 152: an honest, no-link-yet line for the
// immediate order-created email — payment isn't confirmed at this
// point, so no download access exists yet regardless of payment
// method. Never claims a download is ready; only sets the right
// expectation for what happens once payment clears.
function digitalItemsNoticeForOrderCreated(order: OrderEmailData): string {
  if (!order.hasDigitalItems) return "";
  return "\n\nThis order includes a digital download item. It will be available to download once your payment is confirmed.";
}

export function renderOrderCreatedEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Your Seasonedz Group Order ${order.orderNumber} Has Been Received`;
  const body = `Hi ${order.customerFirstName},

Thank you for your order with Seasonedz Group! We've received order ${order.orderNumber} and it's now being processed.

Items Ordered:
${formatItemsList(order.items)}

Order Total: ${formatRand(order.total)}
Payment Method: ${humanizeEnum(order.paymentMethod)}
Payment Status: ${humanizeEnum(order.paymentStatus)}

${paymentInstructions(order.paymentMethod)}${digitalItemsNoticeForOrderCreated(order)}

Delivery Method: ${formatDeliveryMethodLabel(order.deliveryMethod)} (${order.deliveryFee === 0 ? "FREE" : formatRand(order.deliveryFee)})
${formatDeliveryNote(order)}

${deliveryFulfilmentNote(order)}${preorderFulfilmentNotice(order)}

Any questions? Reach us directly:
${ORDER_CONTACT_BLOCK}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Version 6, Milestone 53: a gentle follow-up for an order that has
// stayed PENDING for a while (see VERSION_6_ADMIN_ORDER_MONITORING_PLAN.md's
// "Pending Payment Follow-Up Process") — distinct from the initial
// order-created email, which already states the order is Pending as
// its normal starting state. Not yet triggered by anything; a future
// milestone would call this after a defined pending window.
export function renderPaymentPendingEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Still Waiting on Payment for Order ${order.orderNumber}`;
  const body = `Hi ${order.customerFirstName},

We're still waiting on payment for your Seasonedz Group order ${order.orderNumber}, for ${formatRand(order.total)}.

${paymentInstructions(order.paymentMethod)}

If you've already paid, please let us know so we can match it to your order. If your plans have changed, just reply and we'll help sort it out.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Version 7, Milestone 152: the only place a download link is ever
// included in an email — and only once payment is genuinely confirmed
// PAID (this template is only ever rendered from that point). Never
// includes a raw signed URL or storage path (see
// digitalAssetStorage.service.ts) — guestDownloadUrl is the one-time
// secure-token link (digitalDownload.service.ts), which itself only
// ever lists the order's files and generates a short-lived signed URL
// per click, never embedding one directly in the email.
function digitalItemsNoticeForPaymentConfirmed(order: OrderEmailData): string {
  if (!order.hasDigitalItems) return "";

  if (order.guestDownloadUrl) {
    return `\n\nThis order includes a digital download. You can access it securely here:\n${order.guestDownloadUrl}\n(This link is personal to your order and will expire. Please don't share it.)`;
  }

  return "\n\nThis order includes a digital download. Log in to My Account and open this order to download it.";
}

export function renderPaymentConfirmedEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Payment Confirmed for Order ${order.orderNumber}`;
  const body = `Hi ${order.customerFirstName},

Good news: your payment for order ${order.orderNumber} has been confirmed. Thank you!

Order Total: ${formatRand(order.total)}
Payment Status: ${humanizeEnum(order.paymentStatus)}

We're now getting your order ready. You're welcome to check its progress any time using your order number.${digitalItemsNoticeForPaymentConfirmed(order)}${preorderFulfilmentNotice(order)}

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderPaymentFailedOrCancelledEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Payment Not Completed for Order ${order.orderNumber}`;
  const body = `Hi ${order.customerFirstName},

We noticed that payment for order ${order.orderNumber} was not completed (status: ${humanizeEnum(order.paymentStatus)}).

Order Total: ${formatRand(order.total)}

No charge has been taken, and your order hasn't shipped yet. If this wasn't intentional, you're welcome to try paying again, or choose a different payment method.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Version 6, Milestone 53: customer-facing acknowledgement for Contact,
// School, Wholesale and Distributor enquiries alike — see
// VERSION_6_EMAIL_SERVICE_PLAN.md's Contact/Schools/Wholesale Enquiry
// Email Plan sections, which flagged this "we received your message"
// email as a small addition not yet templated. One shared function
// covers all four enquiry types (enquiryTypeIntro varies the opening
// line only), matching EnquiryEmailData's existing single shape.
export function renderEnquiryReceivedEmail(enquiry: EnquiryEmailData): RenderedEmail {
  const subject = `We've Received Your ${humanizeEnum(enquiry.type)} Enquiry`;
  const body = `Hi ${enquiry.name},

${enquiryTypeIntro(enquiry.type)} We've received your message and a member of our small team will get back to you soon.

Your Reference: ${enquiry.id}

Your Message:
${enquiry.message}

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Version 7, Milestone 117: expanded with full contact/delivery/item
// detail so the admin alert alone is enough to start preparing the
// order without needing to open the dashboard first — deliberately
// says nothing about Courier Guy quoting/booking (that stays an
// admin-dashboard-only action, never mentioned in an email).
export function renderAdminNewOrderEmail(order: OrderEmailData): RenderedEmail {
  const subject = `New Order Received: ${order.orderNumber}`;
  const bankTransferReminder =
    order.paymentMethod === "BANK_TRANSFER"
      ? "\n\nThis is a Bank Transfer order. Check the business bank account and confirm payment before packing."
      : "";
  // Version 7, Milestone 152: admin visibility only — never mentions
  // Courier Guy or download-access specifics here, matching this
  // template's existing "says nothing about admin-dashboard-only
  // actions" discipline.
  const digitalItemsReminder = order.hasDigitalItems
    ? "\n\nThis order includes a digital download item."
    : "";

  const body = `A new order has been placed on Seasonedz Group.

Order Number: ${order.orderNumber}
Customer: ${order.customerFirstName} ${order.customerLastName}
Customer Phone: ${order.customerPhone}
Customer Email: ${order.customerEmail}

Items Ordered:
${formatItemsList(order.items)}

Order Total: ${formatRand(order.total)}
Payment Method: ${humanizeEnum(order.paymentMethod)}
Payment Status: ${humanizeEnum(order.paymentStatus)}${bankTransferReminder}${digitalItemsReminder}

Delivery Method: ${formatDeliveryMethodLabel(order.deliveryMethod)} (${order.deliveryFee === 0 ? "FREE" : formatRand(order.deliveryFee)})
${formatDeliveryNote(order)}

Please review this order in the admin dashboard and prepare it for processing.`;

  return { subject, body };
}

// Version 7, Milestone 132: plain-text, same tone as every other
// template here. Deliberately says nothing about the account's
// password, current or new — only the reset link itself, which
// already carries the one-time, 60-minute-expiring token. Safe to send
// even if the request wasn't genuinely made by the account holder
// (the "if you didn't request this" line), since clicking the link
// alone changes nothing — a new password still has to be typed in.
export function renderPasswordResetEmail(data: PasswordResetEmailData): RenderedEmail {
  const subject = "Reset your Seasonedz Group password";
  const body = `Hi ${data.customerFirstName},

We received a request to reset the password for your Seasonedz Group account.

Reset your password using the link below:
${data.resetUrl}

This link expires in 60 minutes. If you didn't request this, you can safely ignore this email. Your password won't be changed.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Milestone 179, brief section 18: subject explicitly names it as an
// admin verification code, body explains it's for signing in to
// Seasonedz Admin, states the code and expiry, and what to do if this
// wasn't requested — never the password, never a session token.
export function renderAdminOtpEmail(data: AdminOtpEmailData): RenderedEmail {
  const subject = "Seasonedz Admin Verification Code";
  const body = `Hi ${data.adminName},

A sign-in to Seasonedz Admin was just requested for your account. Use the verification code below to complete sign-in:

${data.code}

This code expires in ${data.expiresInMinutes} minutes and can only be used once.

If you did not attempt to sign in, you can ignore this email. Your account remains secure and no changes have been made.

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Milestone 179, brief section 6: an activation link only, 24 hour
// expiry stated plainly — never a generated password.
export function renderAdminInvitationEmail(data: AdminInvitationEmailData): RenderedEmail {
  const subject = "You have been invited to Seasonedz Admin";
  const inviterLine = data.inviterName ? `${data.inviterName} has invited you` : "You have been invited";
  const body = `Hi ${data.inviteeName},

${inviterLine} to join Seasonedz Admin as ${humanizeEnum(data.role)}.

Set up your account and choose your own password using the link below:
${data.activationUrl}

This link expires in 24 hours and can only be used once. If you were not expecting this invitation, you can safely ignore this email.

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Milestone 179, brief section 24: mirrors renderPasswordResetEmail
// above closely, deliberately kept as a separate function so the admin
// and customer wording can diverge safely (e.g. the 30 minute expiry
// here vs 60 minutes for customers).
export function renderAdminPasswordResetEmail(data: AdminPasswordResetEmailData): RenderedEmail {
  const subject = "Reset your Seasonedz Admin password";
  const body = `Hi ${data.adminName},

We received a request to reset the password for your Seasonedz Admin account.

Reset your password using the link below:
${data.resetUrl}

This link expires in 30 minutes and can only be used once. If you didn't request this, you can safely ignore this email. Your password won't be changed, and you don't need to take any action.

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderAdminNewEnquiryEmail(enquiry: EnquiryEmailData): RenderedEmail {
  const subject = `New ${humanizeEnum(enquiry.type)} Enquiry Received`;
  const body = `A new enquiry has been submitted on Seasonedz Group.

Enquiry Reference: ${enquiry.id}
Type: ${humanizeEnum(enquiry.type)}
From: ${enquiry.name} (${enquiry.email})

Message:
${enquiry.message}

Please follow up with this enquiry.`;

  return { subject, body };
}

// ---------------------------------------------------------------------------
// Version 7, Milestone 174B: order lifecycle (processing/cancelled) and
// courier delivery-stage templates. All routed through
// notificationEngine.service.ts, never called directly — see that
// file's own header comment. Reuse OrderEmailData exactly as the
// existing order-created/payment-confirmed templates above do.
// ---------------------------------------------------------------------------

export function renderOrderProcessingEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Order ${order.orderNumber} Is Being Prepared`;
  const body = `Hi ${order.customerFirstName},

Good news: we've started preparing your Seasonedz Group order ${order.orderNumber}.

${deliveryFulfilmentNote(order)}

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderOrderCancelledEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Order ${order.orderNumber} Has Been Cancelled`;
  const body = `Hi ${order.customerFirstName},

Your Seasonedz Group order ${order.orderNumber} has been cancelled.

Order Total: ${formatRand(order.total)}

If this wasn't expected, please get in touch and we'll help sort it out.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Version 7, Milestone 173/173A: this is the first genuine courier
// movement Seasonedz's own automatic sync ever confirms for an order —
// deliberately doesn't claim a live tracking feed or a specific ETA,
// matching this project's existing "honest, not overclaiming" delivery
// wording discipline (see DELIVERY_SETUP.md).
export function renderCourierCollectedEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Order ${order.orderNumber} Is On Its Way`;
  const body = `Hi ${order.customerFirstName},

Your Seasonedz Group order ${order.orderNumber} has been collected by ${formatDeliveryMethodLabel(order.deliveryMethod)} and is on its way to you.

You're welcome to check its progress any time using your order number.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderOutForDeliveryEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Order ${order.orderNumber} Is Out for Delivery`;
  const body = `Hi ${order.customerFirstName},

Your Seasonedz Group order ${order.orderNumber} is out for delivery today.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderDeliveredEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Order ${order.orderNumber} Has Been Delivered`;
  const body = `Hi ${order.customerFirstName},

Your Seasonedz Group order ${order.orderNumber} has been delivered. We hope you love it!

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Version 7, Milestone 174B: admin-only. Deliberately never sent to the
// customer directly from here — courierStatusSync.service.ts's own
// EXCEPTION/RETURNED handling stays conservative toward customers (see
// notificationEngine.service.ts), so this is the one place that gets
// the real, raw provider status string for admin follow-up.
export function renderAdminDeliveryExceptionEmail(data: AdminDeliveryExceptionEmailData): RenderedEmail {
  const subject = `Delivery Exception on Order ${data.orderNumber}`;
  const body = `A courier delivery issue was reported for order ${data.orderNumber}.

Courier Guy status: ${data.rawCourierStatus}

Please review this order in the admin dashboard.`;

  return { subject, body };
}

// ---------------------------------------------------------------------------
// Version 7, Milestone 174B: affiliate lifecycle templates.
// ---------------------------------------------------------------------------

export function renderAffiliateApplicationReceivedEmail(data: AffiliateEmailData): RenderedEmail {
  const subject = "Your Seasonedz Affiliate Application Has Been Received";
  const body = `Hi ${data.affiliateName},

Thank you for applying to the Seasonedz Affiliate Programme. Your application has been received and is awaiting review. We'll be in touch once a decision has been made.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderAdminNewAffiliateEmail(data: AffiliateEmailData): RenderedEmail {
  const subject = "New Affiliate Application Received";
  const body = `A new affiliate application has been submitted on Seasonedz Group.

Applicant: ${data.affiliateName} (${data.affiliateEmail})

Please review this application in the admin dashboard.`;

  return { subject, body };
}

// Version 7, Milestone 174B: never promises earnings — matches
// affiliateTerms.js's own "No Guarantee of Earnings" section.
export function renderAffiliateApprovedEmail(data: AffiliateEmailData): RenderedEmail {
  const subject = "Your Seasonedz Affiliate Application Has Been Approved";
  const body = `Hi ${data.affiliateName},

Good news: your Seasonedz Affiliate application has been approved.

Your Referral Code: ${data.referralCode ?? "Not available"}
Your Referral Link: ${data.referralLink ?? "Not available"}
Your Current Commission Rate: ${data.effectiveCommissionRate ?? "Not available"}%
Your Customers' Current Referral Discount: ${data.effectiveDiscountRate ?? "Not available"}%

Log in to My Account to see your full affiliate portal, including your referral link and commission balance.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderAffiliateRejectedEmail(data: AffiliateEmailData): RenderedEmail {
  const subject = "Your Seasonedz Affiliate Application";
  const body = `Hi ${data.affiliateName},

Thank you for your interest in the Seasonedz Affiliate Programme. After review, your application was not approved at this time.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderAffiliateSuspendedEmail(data: AffiliateEmailData): RenderedEmail {
  const subject = "Your Seasonedz Affiliate Account Status";
  const body = `Hi ${data.affiliateName},

Your Seasonedz Affiliate account has been suspended. New referral activity will not earn further commission while this is in effect. Any commission already earned in good faith before this change is unaffected.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderCommissionApprovedEmail(data: CommissionEmailData): RenderedEmail {
  const subject = "A Commission Has Been Approved";
  const body = `Hi ${data.affiliateName},

A commission of ${formatRand(data.commissionAmount)} for order ${data.orderNumber} has been approved and added to your approved balance.

Log in to My Account to see your full commission balance and payout status.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderPayoutRecordedEmail(data: PayoutEmailData): RenderedEmail {
  const subject = "Your Seasonedz Affiliate Payout Has Been Recorded";
  const body = `Hi ${data.affiliateName},

A payout of ${formatRand(data.amountPaid)} has been recorded as paid to you, dated ${data.paidAt.toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}.

Log in to My Account to see your full payout history.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// ---------------------------------------------------------------------------
// Version 7, Milestone 174B: admin-only product review alert.
// ---------------------------------------------------------------------------

export function renderAdminNewReviewEmail(data: AdminNewReviewEmailData): RenderedEmail {
  const subject = `New Product Review Submitted: ${data.productName}`;
  const body = `A new product review has been submitted on Seasonedz Group.

Product: ${data.productName}
Rating: ${data.rating}/5
From: ${data.customerName}

Review:
${data.reviewText}

Please review this in the admin dashboard.`;

  return { subject, body };
}

// ---------------------------------------------------------------------------
// Version 7, Milestone 174C: customer engagement templates.
// ---------------------------------------------------------------------------

// The same, already-live Google Business review link confirmed during
// the 174A audit — never a second/new Google integration, and never
// presented as if it were a verified Seasonedz product review (see
// this function's own body copy, which keeps the two clearly
// separate).
const GOOGLE_REVIEW_URL = "https://g.page/r/CVDIjAAjMaL7EAI/review";

// Brief section 43: every optional/engagement email links to where a
// customer can turn that category off, distinct from a transactional
// email's own "no unsubscribe" nature. Always the same, real
// account-notification-preferences page — never the newsletter's own
// unsubscribe mechanism (brief section 43's own "do not use newsletter
// unsubscribe architecture unless genuinely shared"). Safe even for an
// abandoned-checkout reminder that might reach a guest: visiting this
// link while logged out shows the account page's own existing sign-in
// prompt, never a broken page.
function preferencesLink(): string {
  return `Manage which of these emails you receive: ${preferredFrontendBaseUrl()}/account`;
}

// Deliberately neutral wording throughout — never asks for a specific
// star rating, never offers or implies a reward for a positive review
// (brief section 12/51).
export function renderProductReviewRequestEmail(data: ProductReviewRequestEmailData): RenderedEmail {
  const productLines = data.products.map((product) => `- ${product.productName}`).join("\n");

  const subject = data.isReminder ? `A Quick Reminder: How Was Your Seasonedz Order ${data.orderNumber}?` : `How Are You Enjoying Your Seasonedz Order ${data.orderNumber}?`;

  const intro = data.isReminder
    ? `We wrote to you a little while ago about your recent Seasonedz Group order ${data.orderNumber}. If you haven't had a chance yet, we'd still love to hear your thoughts on:`
    : `Thank you for your recent Seasonedz Group order ${data.orderNumber}. We hope you and your family are enjoying it! We'd love to hear your thoughts on:`;

  const body = `Hi ${data.customerFirstName},

${intro}

${productLines}

You can leave a review from your order page: ${data.reviewUrl}

Enjoyed your overall experience with Seasonedz Group? We'd also really appreciate a review on Google:
${GOOGLE_REVIEW_URL}

${preferencesLink()}

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderStockAlertEmail(data: StockAlertEmailData): RenderedEmail {
  const subject = `Back in Stock: ${data.productName}`;
  const body = `Hi ${data.customerFirstName},

Good news: ${data.productName} is back in stock on Seasonedz Group.

View it here: ${data.productUrl}

${preferencesLink()}

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderWishlistStockAlertEmail(data: StockAlertEmailData): RenderedEmail {
  const subject = `A Wishlist Item Is Back in Stock: ${data.productName}`;
  const body = `Hi ${data.customerFirstName},

${data.productName}, saved on your Seasonedz Group wishlist, is back in stock.

View it here: ${data.productUrl}

${preferencesLink()}

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Never invents scarcity, a discount, or an expiry — brief section 33.
export function renderAbandonedCheckoutReminderEmail(data: AbandonedCheckoutEmailData): RenderedEmail {
  const subject = "Still Interested in Your Seasonedz Order?";
  const greeting = data.customerFirstName ? `Hi ${data.customerFirstName},` : "Hi,";
  const body = `${greeting}

We noticed you didn't quite finish checking out on Seasonedz Group. Your cart is still waiting for you if you'd like to complete your order:

${data.recoveryUrl}

${preferencesLink()}

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Version 7, Milestone 176: application submitted — a distinct, richer
// notification from the old, simple "AFFILIATE_APPLICATION_RECEIVED"
// email above (still used only by the legacy simple-apply code path if
// it's ever reached — see affiliateApplication.service.ts). Never
// mentions document content, classification results, or any
// identity/bank detail (brief section 42).
export function renderAffiliateApplicationSubmittedEmail(data: AffiliateApplicationSubmittedEmailData): RenderedEmail {
  const subject = "Your Seasonedz Affiliate Application Has Been Submitted";
  const body = `Hi ${data.applicantFirstName},

Thank you for completing your Seasonedz Affiliate Programme application. We've received your details and documents and they're now awaiting review by our team.

We'll be in touch once a decision has been made. No further action is needed from you right now.

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

// Never includes the specific document content or full identity/bank
// numbers — only the same short, safe reason an admin sees themselves
// (brief section 42/43).
export function renderAffiliateApplicationActionRequiredEmail(data: AffiliateApplicationActionRequiredEmailData): RenderedEmail {
  const subject = "Action Needed on Your Seasonedz Affiliate Application";
  const body = `Hi ${data.applicantFirstName},

We've reviewed your Seasonedz Affiliate Programme application and need you to correct or replace something before we can continue:

${data.reason}

Please sign in and update your application here:

${data.applicationUrl}

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}
