// Version 7, Milestone 174B: the one central notification service.
// Every business event that wants to notify a customer or admin calls
// enqueueAndSendNow() here — never Brevo, never email.service.ts's
// deliverRenderedEmail(), directly. See VERSION_7_NOTIFICATION_AUDIT_174A.md
// for the full audit this design is based on.
//
// DESIGN — read before extending this file.
//
// 1. Content is rendered by the CALLER, once, at enqueue time (using
//    the existing emailTemplates.ts render functions exactly as before
//    this milestone) and stored verbatim on the Notification row
//    (renderedSubject/renderedBody). A retry re-sends this same stored
//    content rather than re-deriving possibly-different content later
//    — the processor needs no per-event-type "re-fetch the order and
//    re-render" logic at all, just "take the stored content, send it."
//    This also means the Notification row IS the audit trail: you can
//    see exactly what a customer received, forever, not just that
//    something was sent.
//
// 2. PASSWORD_RESET never goes through enqueueAndSendNow() — see
//    recordPasswordResetAttempt() below and email.service.ts's own
//    header comment for why. A reset link contains a one-time token
//    that must never be persisted or logged anywhere; this table only
//    ever records that a reset was attempted and whether it sent, with
//    renderedSubject/renderedBody left null for that one event type.
//
// 3. dedupeKey is supplied by the CALLER, not computed here — each
//    business event knows what "duplicate" genuinely means for itself
//    (e.g. a PayFast ITN retry vs. two independent affiliate
//    applications), so the semantics stay with the caller; this engine
//    only enforces the resulting key's uniqueness via the database
//    constraint (brief section 7).
//
// 4. Transaction safety (brief section 8/39): enqueueAndSendNow() is
//    always called AFTER the real business transaction (order/payment/
//    courier/affiliate write) has already committed, fire-and-forget
//    from the caller's side — `void notificationEngine.enqueueAndSendNow(...).catch(() => {})`,
//    the exact same discipline every existing send*Email call site
//    already used before this milestone. This function itself never
//    throws to its caller either, for the same reason.
//
// 5. Failure isolation: a Brevo failure marks the Notification row
//    FAILED (with a retry scheduled if attempts remain) — it can never
//    roll back or affect the order/payment/courier/affiliate state
//    that triggered it, because that state was already committed
//    before this function was ever called.

import { randomUUID } from "node:crypto";
import { NotificationStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { deliverRenderedEmail, EmailDeliveryError } from "./email/email.service.js";
import { sendPasswordResetEmail as sendPasswordResetEmailDirect } from "./email/email.service.js";
import type { EmailRecipientRole, EmailTemplateName, RenderedEmail } from "./email/email.types.js";
import type { PasswordResetEmailData } from "./email/email.types.js";

export type NotificationEventType =
  | "ORDER_PLACED"
  | "ADMIN_NEW_ORDER"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_FAILED"
  | "ORDER_PROCESSING"
  | "ORDER_CANCELLED"
  | "COURIER_COLLECTED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "ADMIN_DELIVERY_EXCEPTION"
  | "AFFILIATE_APPLICATION_RECEIVED"
  | "ADMIN_NEW_AFFILIATE"
  | "AFFILIATE_APPROVED"
  | "AFFILIATE_REJECTED"
  | "AFFILIATE_SUSPENDED"
  | "COMMISSION_APPROVED"
  | "PAYOUT_RECORDED"
  | "ADMIN_NEW_REVIEW"
  | "CUSTOMER_ENQUIRY_ACKNOWLEDGEMENT"
  | "ADMIN_NEW_ENQUIRY"
  // Never enqueued via enqueueAndSendNow() — recorded only via
  // recordPasswordResetAttempt(). Included here so the type is
  // documented in one place and admin log filtering can still show it.
  | "PASSWORD_RESET"
  // Version 7, Milestone 174C: always scheduled via scheduleNotification()
  // below, never sent immediately — see productReviewRequest.service.ts.
  // Content is deliberately NOT rendered at schedule time (see
  // attemptSend()'s own lazy-render branch): which products are still
  // unreviewed can only be known at the moment this is actually due,
  // not seven days earlier when it was scheduled.
  | "PRODUCT_REVIEW_REQUEST"
  | "PRODUCT_REVIEW_REMINDER"
  | "STOCK_ALERT"
  | "WISHLIST_STOCK_ALERT"
  | "ABANDONED_CHECKOUT_REMINDER"
  // Version 7, Milestone 176: affiliate application/verification.
  // Approval/rejection reuse the EXISTING "AFFILIATE_APPROVED"/
  // "AFFILIATE_REJECTED" events above unchanged — approveAffiliate()/
  // rejectAffiliate() (referralAffiliate.service.ts) are called as-is
  // by the new application admin actions, so those two notifications
  // already fire correctly with zero new event types needed for them.
  | "AFFILIATE_APPLICATION_SUBMITTED"
  | "AFFILIATE_APPLICATION_ACTION_REQUIRED";

// Version 7, Milestone 174C: a lazy-render outcome — either genuine
// content to send, or "cancel" when the renderer determines, at the
// moment of actually sending, that there is nothing left worth saying
// (e.g. every product on a review-request row has since been
// reviewed). Dynamically imported inside lazyRender() below (not a
// top-level import) purely to avoid a circular module dependency —
// productReviewRequest.service.ts itself imports scheduleNotification/
// cancelPendingNotificationByDedupeKey from this same file.
export type LazyRenderOutcome = { kind: "send"; rendered: RenderedEmail } | { kind: "cancel"; reason: string };
type LazyRenderableRow = { id: string; dedupeKey: string; orderNumber: string | null; recipientCustomerId: string | null };

const REVIEW_LAZY_RENDER_EVENT_TYPES = new Set<string>(["PRODUCT_REVIEW_REQUEST", "PRODUCT_REVIEW_REMINDER"]);

async function lazyRender(row: LazyRenderableRow & { eventType: string }): Promise<LazyRenderOutcome | undefined> {
  if (REVIEW_LAZY_RENDER_EVENT_TYPES.has(row.eventType)) {
    const { renderProductReviewRequestContent } = await import("./productReviewRequest.service.js");
    return renderProductReviewRequestContent(row);
  }
  if (row.eventType === "ABANDONED_CHECKOUT_REMINDER") {
    const { renderAbandonedCheckoutReminderContent } = await import("./checkoutIntent.service.js");
    return renderAbandonedCheckoutReminderContent(row);
  }
  return undefined;
}

// Bounded retry (brief section 41) — attempt 1 is the immediate send;
// attempts 2 and 3 are the processor's retries, spaced out rather than
// hammering Brevo. Index [attemptCount - 1] is the delay applied after
// that attempt fails. maxAttempts on the row defaults to this array's
// length + 1.
const RETRY_DELAY_MINUTES = [5, 30];
export const DEFAULT_MAX_ATTEMPTS = RETRY_DELAY_MINUTES.length + 1;

export interface EnqueueNotificationInput {
  eventType: Exclude<NotificationEventType, "PASSWORD_RESET">;
  templateName: EmailTemplateName;
  recipientEmail: string | undefined;
  recipientCustomerId?: string;
  orderNumber?: string;
  affiliateId?: string;
  productId?: string;
  dedupeKey: string;
  rendered: RenderedEmail;
}

function recipientRoleForEventType(eventType: NotificationEventType): EmailRecipientRole {
  return eventType.startsWith("ADMIN_") ? "admin" : "customer";
}

// The one entry point every business service calls. Never throws.
// Returns void deliberately — the caller only ever needs "did this
// complete," never a Notification id, matching the fire-and-forget
// discipline described in this file's own header comment.
export async function enqueueAndSendNow(input: EnqueueNotificationInput): Promise<void> {
  let created: { id: string } | null = null;
  try {
    created = await prisma.notification.create({
      data: {
        eventType: input.eventType,
        templateName: input.templateName,
        recipientEmail: input.recipientEmail,
        recipientCustomerId: input.recipientCustomerId,
        orderNumber: input.orderNumber,
        affiliateId: input.affiliateId,
        productId: input.productId,
        dedupeKey: input.dedupeKey,
        renderedSubject: input.rendered.subject,
        renderedBody: input.rendered.body,
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // The whole point of dedupeKey's uniqueness (brief section 7) —
      // this exact event was already enqueued once, genuinely or as a
      // duplicate/retried business call. Never a second row, never a
      // second send.
      console.log(`[notifications] duplicate suppressed for dedupeKey="${input.dedupeKey}"`);
      return;
    }
    console.warn(`[notifications] failed to enqueue eventType="${input.eventType}" dedupeKey="${input.dedupeKey}": ${error instanceof Error ? error.message : "Unknown error"}`);
    return;
  }

  try {
    await attemptSend(created.id);
  } catch (error) {
    // attemptSend() already handles its own failure bookkeeping
    // internally and shouldn't throw — this is a last-resort guard so a
    // genuinely unexpected error here can never propagate to the
    // business call site that triggered enqueueAndSendNow().
    console.warn(`[notifications] unexpected error attempting immediate send for notification=${created.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Version 7, Milestone 174C: for a notification that must NOT be sent
// now — a review request, a stock alert re-check, an abandoned-
// checkout reminder — all genuinely future-dated. Unlike
// enqueueAndSendNow(), this never calls attemptSend(); the row simply
// sits PENDING until the processor's own due-notification query
// (scheduledAt <= now) picks it up. `rendered` is deliberately
// optional here (unlike EnqueueNotificationInput) — see
// attemptSend()'s own lazy-render branch below for why a review
// request's content can only be safely rendered once, at the moment
// it's actually about to send.
export interface ScheduleNotificationInput {
  eventType: Exclude<NotificationEventType, "PASSWORD_RESET">;
  templateName: EmailTemplateName;
  recipientEmail: string | undefined;
  recipientCustomerId?: string;
  orderNumber?: string;
  affiliateId?: string;
  productId?: string;
  dedupeKey: string;
  scheduledAt: Date;
  rendered?: RenderedEmail;
}

// Never throws — same discipline as enqueueAndSendNow(). Returns
// silently (including on a duplicate dedupeKey) since callers never
// need the created row's id; they only need "this will be attempted
// later."
export async function scheduleNotification(input: ScheduleNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        eventType: input.eventType,
        templateName: input.templateName,
        recipientEmail: input.recipientEmail,
        recipientCustomerId: input.recipientCustomerId,
        orderNumber: input.orderNumber,
        affiliateId: input.affiliateId,
        productId: input.productId,
        dedupeKey: input.dedupeKey,
        scheduledAt: input.scheduledAt,
        renderedSubject: input.rendered?.subject,
        renderedBody: input.rendered?.body,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      console.log(`[notifications] duplicate suppressed for dedupeKey="${input.dedupeKey}"`);
      return;
    }
    console.warn(`[notifications] failed to schedule eventType="${input.eventType}" dedupeKey="${input.dedupeKey}": ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Version 7, Milestone 174C: suppresses a still-PENDING scheduled
// notification that has become moot before it was ever due — e.g. a
// review-request row for an order that gets fully reviewed, or a
// wishlist alert for a product removed from the wishlist again before
// restock. Deliberately narrow: only ever touches a row that is still
// PENDING (never one already PROCESSING/SENT/FAILED — those have
// either already gone out or are being handled by the normal retry
// path), and CANCELLED is a genuinely distinct, expected outcome, not
// a failure.
export async function cancelPendingNotificationByDedupeKey(dedupeKey: string): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: { dedupeKey, status: NotificationStatus.PENDING },
      data: { status: NotificationStatus.CANCELLED, cancelledAt: new Date() },
    });
  } catch (error) {
    console.warn(`[notifications] failed to cancel dedupeKey="${dedupeKey}": ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Shared by both the immediate-send path above and the processor
// (notificationProcessor.service.ts). Atomically claims the row
// (PENDING/FAILED -> PROCESSING) before doing anything else, so two
// callers (an immediate send racing a processor run, or two overlapping
// processor runs) can never both send the same notification (brief
// section 44) — the claim is a single conditional UPDATE, not an
// in-memory lock.
export async function attemptSend(notificationId: string): Promise<void> {
  const claim = await prisma.notification.updateMany({
    where: { id: notificationId, status: { in: [NotificationStatus.PENDING, NotificationStatus.FAILED] } },
    data: { status: NotificationStatus.PROCESSING, attemptCount: { increment: 1 } },
  });
  if (claim.count === 0) {
    // Already SENT/CANCELLED, already PROCESSING (another worker got
    // there first), or genuinely doesn't exist. Nothing to do.
    return;
  }

  const row = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!row) return; // Defensive — cannot happen given the claim above just succeeded.

  const recipientRole = recipientRoleForEventType(row.eventType as NotificationEventType);

  if (!row.recipientEmail) {
    // A permanent data problem, not a transient one (brief section 41
    // — "never retry permanently invalid recipient errors endlessly").
    // Exhausts retries immediately rather than leaving this to fail
    // maxAttempts times first.
    await prisma.notification.update({
      where: { id: row.id },
      data: { status: NotificationStatus.FAILED, failedAt: new Date(), lastError: "No recipient email on this notification.", attemptCount: row.maxAttempts },
    });
    return;
  }

  let renderedSubject = row.renderedSubject;
  let renderedBody = row.renderedBody;

  if (!renderedSubject || !renderedBody) {
    const outcome = await lazyRender(row);
    if (outcome) {
      // Version 7, Milestone 174C: content for a handful of event types
      // (review requests, chiefly) can only be safely produced at the
      // moment of actually sending — see ScheduleNotificationInput's
      // own header comment for why. The renderer re-derives everything
      // fresh (e.g. which products are still genuinely unreviewed) and
      // either returns something to send, or "cancel" if nothing is
      // left worth saying.
      if (outcome.kind === "cancel") {
        await prisma.notification.update({
          where: { id: row.id },
          data: { status: NotificationStatus.CANCELLED, cancelledAt: new Date(), lastError: outcome.reason },
        });
        return;
      }
      renderedSubject = outcome.rendered.subject;
      renderedBody = outcome.rendered.body;
      // Persisted immediately (before the send attempt below) so the
      // row's own audit trail always reflects exactly what was about
      // to be sent, even if delivery itself then fails and retries —
      // a retry must never re-run the lazy renderer and risk producing
      // different content the second time around.
      await prisma.notification.update({ where: { id: row.id }, data: { renderedSubject, renderedBody } });
    } else {
      // Should never happen outside PASSWORD_RESET, which never
      // reaches this function (see recordPasswordResetAttempt()) —
      // defensive only.
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: NotificationStatus.FAILED, failedAt: new Date(), lastError: "No rendered content stored for this notification.", attemptCount: row.maxAttempts },
      });
      return;
    }
  }

  try {
    await deliverRenderedEmail({
      templateName: row.templateName,
      recipientRole,
      recipientEmail: row.recipientEmail,
      reference: row.orderNumber ?? row.affiliateId ?? row.productId ?? row.id,
      rendered: { subject: renderedSubject, body: renderedBody },
    });
    await prisma.notification.update({
      where: { id: row.id },
      data: { status: NotificationStatus.SENT, sentAt: new Date() },
    });
  } catch (error) {
    const message = error instanceof EmailDeliveryError || error instanceof Error ? error.message : "Unknown send error";
    const exhausted = row.attemptCount >= row.maxAttempts;
    await prisma.notification.update({
      where: { id: row.id },
      data: {
        status: NotificationStatus.FAILED,
        failedAt: exhausted ? new Date() : undefined,
        lastError: message,
        nextAttemptAt: exhausted ? null : new Date(Date.now() + (RETRY_DELAY_MINUTES[row.attemptCount - 1] ?? RETRY_DELAY_MINUTES[RETRY_DELAY_MINUTES.length - 1]!) * 60_000),
      },
    });
  }
}

// The one deliberate exception (see this file's own header comment).
// customerAuth.controller.ts calls this AFTER already calling
// sendPasswordResetEmail() directly — this only ever records a safe
// audit row, never sends anything itself, and never stores the reset
// URL/token. dedupeKey deliberately includes a fresh random component
// (never just customerId) since, unlike every other event here, a
// second genuine password-reset request is not a duplicate to suppress
// — a customer who didn't receive the first link, or forgot and asked
// again, should get a fresh email every time.
export async function recordPasswordResetAttempt(params: { customerId: string; customerEmail: string; delivered: boolean }): Promise<void> {
  try {
    const now = new Date();
    await prisma.notification.create({
      data: {
        eventType: "PASSWORD_RESET",
        templateName: "password-reset",
        recipientEmail: params.customerEmail,
        recipientCustomerId: params.customerId,
        dedupeKey: `PASSWORD_RESET:${params.customerId}:${randomUUID()}`,
        status: params.delivered ? NotificationStatus.SENT : NotificationStatus.FAILED,
        sentAt: params.delivered ? now : undefined,
        failedAt: params.delivered ? undefined : now,
        lastError: params.delivered ? undefined : "Delivery failed — see server logs for the underlying error (never stored here).",
        attemptCount: 1,
        maxAttempts: 1,
      },
    });
  } catch (error) {
    console.warn(`[notifications] failed to record password-reset audit row: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Thin re-export so callers only ever need to import from this engine
// module for anything notification-related, password reset included —
// see customerAuth.controller.ts.
export async function sendPasswordResetEmailAndRecord(data: PasswordResetEmailData & { customerId: string }): Promise<void> {
  const delivered = await sendPasswordResetEmailDirect(data);
  await recordPasswordResetAttempt({ customerId: data.customerId, customerEmail: data.customerEmail, delivered });
}
