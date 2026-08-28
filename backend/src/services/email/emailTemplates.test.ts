// Version 7, Milestone 177: website and email copy cleanup — brief
// section 20's "safe copy audit test... catch future accidental use of
// em dash/en dash in customer facing copy without scanning technical
// files." This deliberately tests the REAL RENDERED OUTPUT of every
// email template (never the source file's own text), so it can never
// be tripped up by a legitimate `//` comment or a technical value —
// only what an actual recipient would read in their inbox is ever
// inspected. First-party dependency-free too: no source-scanning, no
// comment parser, so it can never become brittle around genuine code
// syntax.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as templates from "./emailTemplates.js";

const EM_DASH = "—";
const EN_DASH = "–";
const DASH_PATTERN = new RegExp(`[${EM_DASH}${EN_DASH}]`);

function assertNoDecorativeDashes(rendered: { subject: string; body: string }, label: string): void {
  assert.doesNotMatch(rendered.subject, DASH_PATTERN, `${label} subject contains an em/en dash: ${JSON.stringify(rendered.subject)}`);
  assert.doesNotMatch(rendered.body, DASH_PATTERN, `${label} body contains an em/en dash: ${JSON.stringify(rendered.body)}`);
}

const ORDER_DATA = {
  orderNumber: "SG-2026-A1B2",
  customerFirstName: "Thandiwe",
  customerLastName: "Nkosi",
  customerEmail: "thandiwe@example.com",
  customerPhone: "0821234567",
  total: 350,
  paymentStatus: "PAID",
  paymentMethod: "PAYFAST",
  items: [{ productName: "ABC Colouring Book", quantity: 2, lineTotal: 300 }],
  deliveryMethod: "COURIER_DOOR",
  deliveryFee: 120,
  collectionCity: null,
  deliveryStreetAddress: "12 Oak Road",
  deliverySuburb: "Sunnyside",
  deliveryCity: "Pretoria",
  deliveryProvince: "Gauteng",
  deliveryPostalCode: "0002",
  deliveryNotes: null,
};

const COLLECTION_ORDER_DATA = { ...ORDER_DATA, deliveryMethod: "COLLECTION", collectionCity: "Pretoria" };
const BANK_TRANSFER_ORDER_DATA = { ...ORDER_DATA, paymentMethod: "BANK_TRANSFER" };
const DIGITAL_ORDER_WITH_GUEST_LINK = { ...ORDER_DATA, hasDigitalItems: true, guestDownloadUrl: "https://api.example.invalid/download/abc123" };

const ENQUIRY_DATA = { id: "enq-1", type: "CONTACT", name: "Thandiwe Nkosi", email: "thandiwe@example.com", message: "Do you deliver to Polokwane?" };
const PASSWORD_RESET_DATA = { customerFirstName: "Thandiwe", customerEmail: "thandiwe@example.com", resetUrl: "https://www.seasonedzgroup.co.za/account/reset-password?token=abc" };
const ADMIN_DELIVERY_EXCEPTION_DATA = { orderNumber: "SG-2026-A1B2", rawCourierStatus: "delivery_failed_customer_not_available" };
const AFFILIATE_DATA = { affiliateName: "Thandiwe Nkosi", affiliateEmail: "thandiwe@example.com" };
const AFFILIATE_APPROVED_DATA = { ...AFFILIATE_DATA, referralCode: "thandiwe-1", referralLink: "https://www.seasonedzgroup.co.za/?ref=thandiwe-1", effectiveCommissionRate: 7, effectiveDiscountRate: 5 };
const AFFILIATE_APPROVED_DATA_MISSING_FIELDS = { ...AFFILIATE_DATA }; // exercises the "Not available" fallback path
const COMMISSION_DATA = { affiliateName: "Thandiwe Nkosi", affiliateEmail: "thandiwe@example.com", orderNumber: "SG-2026-A1B2", commissionAmount: 33.25 };
const PAYOUT_DATA = { affiliateName: "Thandiwe Nkosi", affiliateEmail: "thandiwe@example.com", amountPaid: 580, paidAt: new Date("2026-08-15") };
const ADMIN_REVIEW_DATA = { productName: "ABC Colouring Book", customerName: "Thandiwe Nkosi", rating: 5, reviewText: "My kids love this book." };
const REVIEW_REQUEST_DATA = { customerFirstName: "Thandiwe", orderNumber: "SG-2026-A1B2", products: [{ productName: "ABC Colouring Book" }], reviewUrl: "https://www.seasonedzgroup.co.za/account/orders/SG-2026-A1B2", isReminder: false };
const REVIEW_REMINDER_DATA = { ...REVIEW_REQUEST_DATA, isReminder: true };
const STOCK_ALERT_DATA = { customerFirstName: "Thandiwe", productName: "ABC Colouring Book", productUrl: "https://www.seasonedzgroup.co.za/product/abc-colouring-book" };
const ABANDONED_CHECKOUT_DATA = { customerFirstName: "Thandiwe" as string | null, recoveryUrl: "https://www.seasonedzgroup.co.za/cart?recover=abc123" };
const ABANDONED_CHECKOUT_GUEST_DATA = { customerFirstName: null, recoveryUrl: "https://www.seasonedzgroup.co.za/cart?recover=abc123" };
const APPLICATION_SUBMITTED_DATA = { applicantFirstName: "Thandiwe" };
const APPLICATION_ACTION_REQUIRED_DATA = { applicantFirstName: "Thandiwe", reason: "Please upload a clearer proof of residence document.", applicationUrl: "https://www.seasonedzgroup.co.za/account/affiliate-application" };

test("every order-lifecycle email template renders with no em/en dash in subject or body", () => {
  assertNoDecorativeDashes(templates.renderOrderCreatedEmail(ORDER_DATA), "renderOrderCreatedEmail");
  assertNoDecorativeDashes(templates.renderOrderCreatedEmail(COLLECTION_ORDER_DATA), "renderOrderCreatedEmail (COLLECTION)");
  assertNoDecorativeDashes(templates.renderOrderCreatedEmail(BANK_TRANSFER_ORDER_DATA), "renderOrderCreatedEmail (BANK_TRANSFER)");
  assertNoDecorativeDashes(templates.renderOrderCreatedEmail(DIGITAL_ORDER_WITH_GUEST_LINK), "renderOrderCreatedEmail (digital, guest link)");
  assertNoDecorativeDashes(templates.renderPaymentPendingEmail(ORDER_DATA), "renderPaymentPendingEmail");
  assertNoDecorativeDashes(templates.renderPaymentConfirmedEmail(ORDER_DATA), "renderPaymentConfirmedEmail");
  assertNoDecorativeDashes(templates.renderPaymentConfirmedEmail(DIGITAL_ORDER_WITH_GUEST_LINK), "renderPaymentConfirmedEmail (digital, guest link)");
  assertNoDecorativeDashes(templates.renderPaymentFailedOrCancelledEmail(ORDER_DATA), "renderPaymentFailedOrCancelledEmail");
  assertNoDecorativeDashes(templates.renderAdminNewOrderEmail(ORDER_DATA), "renderAdminNewOrderEmail");
  assertNoDecorativeDashes(templates.renderAdminNewOrderEmail(BANK_TRANSFER_ORDER_DATA), "renderAdminNewOrderEmail (BANK_TRANSFER)");
  assertNoDecorativeDashes(templates.renderAdminNewOrderEmail({ ...ORDER_DATA, hasDigitalItems: true }), "renderAdminNewOrderEmail (digital)");
  assertNoDecorativeDashes(templates.renderOrderProcessingEmail(ORDER_DATA), "renderOrderProcessingEmail");
  assertNoDecorativeDashes(templates.renderOrderProcessingEmail(COLLECTION_ORDER_DATA), "renderOrderProcessingEmail (COLLECTION)");
  assertNoDecorativeDashes(templates.renderOrderCancelledEmail(ORDER_DATA), "renderOrderCancelledEmail");
  assertNoDecorativeDashes(templates.renderCourierCollectedEmail(ORDER_DATA), "renderCourierCollectedEmail");
  assertNoDecorativeDashes(templates.renderOutForDeliveryEmail(ORDER_DATA), "renderOutForDeliveryEmail");
  assertNoDecorativeDashes(templates.renderDeliveredEmail(ORDER_DATA), "renderDeliveredEmail");
  assertNoDecorativeDashes(templates.renderAdminDeliveryExceptionEmail(ADMIN_DELIVERY_EXCEPTION_DATA), "renderAdminDeliveryExceptionEmail");
});

test("every enquiry/password-reset email template renders with no em/en dash", () => {
  assertNoDecorativeDashes(templates.renderEnquiryReceivedEmail(ENQUIRY_DATA), "renderEnquiryReceivedEmail");
  assertNoDecorativeDashes(templates.renderAdminNewEnquiryEmail(ENQUIRY_DATA), "renderAdminNewEnquiryEmail");
  assertNoDecorativeDashes(templates.renderPasswordResetEmail(PASSWORD_RESET_DATA), "renderPasswordResetEmail");
});

test("every affiliate lifecycle email template renders with no em/en dash, including the 'Not available' fallback path", () => {
  assertNoDecorativeDashes(templates.renderAffiliateApplicationReceivedEmail(AFFILIATE_DATA), "renderAffiliateApplicationReceivedEmail");
  assertNoDecorativeDashes(templates.renderAdminNewAffiliateEmail(AFFILIATE_DATA), "renderAdminNewAffiliateEmail");
  assertNoDecorativeDashes(templates.renderAffiliateApprovedEmail(AFFILIATE_APPROVED_DATA), "renderAffiliateApprovedEmail");
  assertNoDecorativeDashes(templates.renderAffiliateApprovedEmail(AFFILIATE_APPROVED_DATA_MISSING_FIELDS), "renderAffiliateApprovedEmail (missing fields)");
  assertNoDecorativeDashes(templates.renderAffiliateRejectedEmail(AFFILIATE_DATA), "renderAffiliateRejectedEmail");
  assertNoDecorativeDashes(templates.renderAffiliateSuspendedEmail(AFFILIATE_DATA), "renderAffiliateSuspendedEmail");
  assertNoDecorativeDashes(templates.renderCommissionApprovedEmail(COMMISSION_DATA), "renderCommissionApprovedEmail");
  assertNoDecorativeDashes(templates.renderPayoutRecordedEmail(PAYOUT_DATA), "renderPayoutRecordedEmail");
  assertNoDecorativeDashes(templates.renderAdminNewReviewEmail(ADMIN_REVIEW_DATA), "renderAdminNewReviewEmail");
});

test("every 174C/176 engagement email template renders with no em/en dash", () => {
  assertNoDecorativeDashes(templates.renderProductReviewRequestEmail(REVIEW_REQUEST_DATA), "renderProductReviewRequestEmail");
  assertNoDecorativeDashes(templates.renderProductReviewRequestEmail(REVIEW_REMINDER_DATA), "renderProductReviewRequestEmail (reminder)");
  assertNoDecorativeDashes(templates.renderStockAlertEmail(STOCK_ALERT_DATA), "renderStockAlertEmail");
  assertNoDecorativeDashes(templates.renderWishlistStockAlertEmail(STOCK_ALERT_DATA), "renderWishlistStockAlertEmail");
  assertNoDecorativeDashes(templates.renderAbandonedCheckoutReminderEmail(ABANDONED_CHECKOUT_DATA), "renderAbandonedCheckoutReminderEmail");
  assertNoDecorativeDashes(templates.renderAbandonedCheckoutReminderEmail(ABANDONED_CHECKOUT_GUEST_DATA), "renderAbandonedCheckoutReminderEmail (guest)");
  assertNoDecorativeDashes(templates.renderAffiliateApplicationSubmittedEmail(APPLICATION_SUBMITTED_DATA), "renderAffiliateApplicationSubmittedEmail");
  assertNoDecorativeDashes(templates.renderAffiliateApplicationActionRequiredEmail(APPLICATION_ACTION_REQUIRED_DATA), "renderAffiliateApplicationActionRequiredEmail");
});

// Version 7, Milestone 177, brief section 14: subjects must never carry
// a decorative separator (e.g. "Seasonedz Group — Order Update").
test("no email subject line contains a pipe or a decorative separator", () => {
  const allRendered = [
    templates.renderOrderCreatedEmail(ORDER_DATA),
    templates.renderPaymentConfirmedEmail(ORDER_DATA),
    templates.renderAffiliateApprovedEmail(AFFILIATE_APPROVED_DATA),
    templates.renderProductReviewRequestEmail(REVIEW_REMINDER_DATA),
    templates.renderAffiliateApplicationSubmittedEmail(APPLICATION_SUBMITTED_DATA),
    templates.renderAffiliateApplicationActionRequiredEmail(APPLICATION_ACTION_REQUIRED_DATA),
  ];
  for (const rendered of allRendered) {
    assert.doesNotMatch(rendered.subject, /\|/, `subject contains a pipe separator: ${rendered.subject}`);
  }
});

// Spot checks: confirms the actual wording, not just the absence of a
// dash — a test that only checked "no dash" could pass even if the
// sentence had been mangled into something ungrammatical.
test("spot check: key rewritten sentences read naturally and completely", () => {
  const orderProcessing = templates.renderOrderProcessingEmail(ORDER_DATA);
  assert.match(orderProcessing.body, /Good news: we've started preparing your Seasonedz Group order/);

  const affiliateApproved = templates.renderAffiliateApprovedEmail(AFFILIATE_APPROVED_DATA_MISSING_FIELDS);
  assert.match(affiliateApproved.body, /Not available/);

  const applicationSubmitted = templates.renderAffiliateApplicationSubmittedEmail(APPLICATION_SUBMITTED_DATA);
  assert.match(applicationSubmitted.body, /We'll be in touch once a decision has been made\. No further action is needed/);

  const reviewReminder = templates.renderProductReviewRequestEmail(REVIEW_REMINDER_DATA);
  assert.match(reviewReminder.subject, /A Quick Reminder: How Was Your Seasonedz Order/);
});
