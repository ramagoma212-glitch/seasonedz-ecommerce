// Version 7, Milestone 174C: product review request scheduling and
// lazy rendering — brief sections 5-14.
//
// Content for PRODUCT_REVIEW_REQUEST/PRODUCT_REVIEW_REMINDER is never
// rendered at schedule time — see notificationEngine.service.ts's own
// ScheduleNotificationInput comment. Between the moment a request is
// scheduled (delivery, or digital payment) and the moment it's
// actually due (up to 7 days later, or a further 7 for the reminder),
// the customer may have already reviewed some or all of the products
// on the order — brief section 11's own "already reviewed" re-check
// must happen immediately before sending, not when the row was
// created. renderProductReviewRequestContent() below is that re-check,
// called by notificationEngine.service.ts's attemptSend() at the
// moment of actual delivery.
import { PaymentStatus, ProductType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { renderProductReviewRequestEmail } from "./email/emailTemplates.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";
import { scheduleNotification, type LazyRenderOutcome } from "./notificationEngine.service.js";

const REVIEW_REQUEST_DELAY_DAYS = 7;
const DIGITAL_REVIEW_REQUEST_DELAY_DAYS = 3;
const REVIEW_REMINDER_DELAY_DAYS = 7;

function daysFromNow(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

export function reviewRequestDedupeKey(orderNumber: string): string {
  return `PRODUCT_REVIEW_REQUEST:${orderNumber}`;
}

export function reviewReminderDedupeKey(orderNumber: string): string {
  return `PRODUCT_REVIEW_REMINDER:${orderNumber}`;
}

async function hasOptedOutOfReviewRequests(customerId: string): Promise<boolean> {
  const pref = await prisma.notificationPreference.findUnique({ where: { customerId }, select: { reviewRequestsOptOut: true } });
  return pref?.reviewRequestsOptOut ?? false;
}

// Called from courierStatusSync.service.ts and adminOrderStatus.service.ts,
// strictly after a genuine DELIVERED transition has already committed
// — never speculatively, never for a transition that merely "would
// have" happened. Covers every order that reaches DELIVERED today,
// physical courier AND Customer Collection alike: this project has no
// dedicated COLLECTED status yet (brief section 6, and see
// NOTIFICATIONS_SETUP.md's own "known, deliberate gaps" for the same
// limitation already documented for courier events generally) — so a
// Customer Collection order reaching DELIVERED via an admin's manual
// status update is, today, indistinguishable from a courier delivery
// at this layer, and gets the exact same review-request timing.
export async function scheduleProductReviewRequestForDeliveredOrder(orderNumber: string, deliveredAt: Date): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { customerId: true, customerEmail: true, paymentStatus: true },
  });
  // A guest order (customerId null) can never have a review submitted
  // for it at all — submitProductReview() requires an authenticated
  // customerId — so scheduling a request for one would only ever
  // produce a broken, unactionable email. Never a fake/incomplete
  // purchase either (paymentStatus must be genuinely PAID).
  if (!order || !order.customerId || order.paymentStatus !== PaymentStatus.PAID) return;
  if (await hasOptedOutOfReviewRequests(order.customerId)) return;

  await scheduleNotification({
    eventType: "PRODUCT_REVIEW_REQUEST",
    templateName: "product-review-request",
    recipientEmail: order.customerEmail,
    recipientCustomerId: order.customerId,
    orderNumber,
    dedupeKey: reviewRequestDedupeKey(orderNumber),
    scheduledAt: daysFromNow(deliveredAt, REVIEW_REQUEST_DELAY_DAYS),
  });
}

// Called from payfast.service.ts's COMPLETE branch and
// adminPaymentConfirmation.service.ts, strictly after a genuine
// newly-PAID transition. Only ever actually schedules anything for a
// 100%-digital order (every item DIGITAL, none PHYSICAL) — a mixed
// order's review request always waits for delivery instead
// (scheduleProductReviewRequestForDeliveredOrder above already covers
// every item on it, digital ones included), so the two hooks can never
// both fire for the same order — brief section 8's own "dedupe
// carefully."
export async function scheduleProductReviewRequestForDigitalOrder(orderNumber: string, paidAt: Date): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { customerId: true, customerEmail: true, items: { select: { productType: true } } },
  });
  if (!order || !order.customerId || order.items.length === 0) return;
  const hasPhysicalItems = order.items.some((item) => item.productType === ProductType.PHYSICAL);
  if (hasPhysicalItems) return;
  if (await hasOptedOutOfReviewRequests(order.customerId)) return;

  await scheduleNotification({
    eventType: "PRODUCT_REVIEW_REQUEST",
    templateName: "product-review-request",
    recipientEmail: order.customerEmail,
    recipientCustomerId: order.customerId,
    orderNumber,
    dedupeKey: reviewRequestDedupeKey(orderNumber),
    scheduledAt: daysFromNow(paidAt, DIGITAL_REVIEW_REQUEST_DELAY_DAYS),
  });
}

// The lazy renderer itself — dynamically imported and called by
// notificationEngine.service.ts's attemptSend() at the exact moment a
// PRODUCT_REVIEW_REQUEST/PRODUCT_REVIEW_REMINDER row is actually due.
// Re-derives everything fresh: eligibility, opt-out, and — the whole
// reason this can't be pre-rendered — which purchased products are
// still genuinely unreviewed right now.
export async function renderProductReviewRequestContent(row: {
  id: string;
  eventType: string;
  orderNumber: string | null;
  recipientCustomerId: string | null;
}): Promise<LazyRenderOutcome> {
  if (!row.orderNumber || !row.recipientCustomerId) {
    return { kind: "cancel", reason: "Missing orderNumber/recipientCustomerId on a review-request row." };
  }

  if (await hasOptedOutOfReviewRequests(row.recipientCustomerId)) {
    return { kind: "cancel", reason: "Customer opted out of review-request emails before this was due." };
  }

  const [order, customer, reviewedProductIds] = await Promise.all([
    prisma.order.findUnique({
      where: { orderNumber: row.orderNumber },
      select: { paymentStatus: true, items: { select: { productId: true, productName: true } } },
    }),
    prisma.customer.findUnique({ where: { id: row.recipientCustomerId }, select: { firstName: true } }),
    prisma.productReview
      .findMany({ where: { customerId: row.recipientCustomerId }, select: { productId: true } })
      .then((rows) => new Set(rows.map((review) => review.productId))),
  ]);

  if (!order || order.paymentStatus !== PaymentStatus.PAID || !customer) {
    return { kind: "cancel", reason: "Order or customer no longer eligible for a review request." };
  }

  const seenProductIds = new Set<string>();
  const eligibleProducts: { productName: string }[] = [];
  for (const item of order.items) {
    if (!item.productId || reviewedProductIds.has(item.productId) || seenProductIds.has(item.productId)) continue;
    seenProductIds.add(item.productId);
    eligibleProducts.push({ productName: item.productName });
  }

  // Section 11: every product on this order already reviewed — never
  // send an email with nothing left to ask about.
  if (eligibleProducts.length === 0) {
    return { kind: "cancel", reason: "Every purchased product on this order has already been reviewed." };
  }

  const isReminder = row.eventType === "PRODUCT_REVIEW_REMINDER";
  const rendered = renderProductReviewRequestEmail({
    customerFirstName: customer.firstName,
    orderNumber: row.orderNumber,
    products: eligibleProducts,
    reviewUrl: `${preferredFrontendBaseUrl()}/account/orders/${row.orderNumber}`,
    isReminder,
  });

  // Section 14: exactly ONE reminder, 7 days after the initial
  // request — scheduled here, the moment the initial request is
  // confirmed genuinely worth sending, never for the reminder itself
  // (no third follow-up). Best-effort: a failure to schedule the
  // reminder must never affect the initial send this call is already
  // committed to returning "send" for.
  if (!isReminder) {
    void scheduleNotification({
      eventType: "PRODUCT_REVIEW_REMINDER",
      templateName: "product-review-reminder",
      recipientEmail: undefined,
      recipientCustomerId: row.recipientCustomerId,
      orderNumber: row.orderNumber,
      dedupeKey: reviewReminderDedupeKey(row.orderNumber),
      scheduledAt: daysFromNow(new Date(), REVIEW_REMINDER_DELAY_DAYS),
    }).catch(() => {});
  }

  return { kind: "send", rendered };
}
