// Email service (Version 3, Milestone 24 — preparation only; templates
// and dry-run log format extended in Version 6, Milestone 53).
//
// No real email is sent by anything in this file:
//  - EMAIL_ENABLED=false (the default) makes every send*Email function
//    a safe no-op.
//  - EMAIL_PROVIDER="console" (the only supported value right now)
//    logs only safe metadata — template name, recipient role, a masked
//    recipient address, an order number/enquiry id, the subject, and a
//    short, non-sensitive preview line. It never logs the full
//    rendered body, a full email address, a raw PayFast payload, or
//    any other personal detail.
//  - Any other EMAIL_PROVIDER value is treated as "not implemented
//    yet" and logs a warning instead of guessing at a real send.
//
// Nothing here is called automatically by order/payment/enquiry
// creation yet — see backend/EMAIL_SETUP.md's "Where Emails Will Be
// Triggered Later" for the planned hook points.

import { env } from "../../config/env.js";
import {
  renderAdminNewEnquiryEmail,
  renderAdminNewOrderEmail,
  renderEnquiryReceivedEmail,
  renderOrderCreatedEmail,
  renderPaymentConfirmedEmail,
  renderPaymentFailedOrCancelledEmail,
  renderPaymentPendingEmail,
} from "./emailTemplates.js";
import type { EmailRecipientRole, EmailTemplateName, EnquiryEmailData, OrderEmailData, RenderedEmail } from "./email.types.js";

// Masks all but the first character of the local part and of the
// domain's first label, e.g. "jane.doe@example.com" -> "j***@e***.com"
// — enough to spot-check in logs without ever printing a real address.
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";

  const domainParts = domain.split(".");
  const firstLabel = domainParts[0] ?? domain;
  const maskedDomain = domainParts.length > 1 ? `${firstLabel[0]}***.${domainParts.slice(1).join(".")}` : `${firstLabel[0]}***`;

  return `${local[0]}***@${maskedDomain}`;
}

// A short, non-sensitive preview line for the dry-run log — never the
// full body. Skips the "Hi {name}," greeting line (the only line that
// carries the customer's name) and, for enquiry templates, never
// touches the customer's own free-text message; it only ever surfaces
// generic template wording or an already-non-sensitive reference like
// an order number, truncated well short of anything resembling a full
// paragraph.
function safePreview(body: string): string {
  const MAX_LENGTH = 80;
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const contentLine = lines.find((line) => !line.startsWith("Hi ")) || "";
  return contentLine.length > MAX_LENGTH ? `${contentLine.slice(0, MAX_LENGTH - 1)}...` : contentLine;
}

function logConsoleEmail(
  templateName: EmailTemplateName,
  recipientRole: EmailRecipientRole,
  recipientEmail: string,
  reference: string,
  rendered: RenderedEmail
): void {
  console.log(
    `[email:console] template="${templateName}" role="${recipientRole}" to="${maskEmail(recipientEmail)}" ref="${reference}" subject="${rendered.subject}" preview="${safePreview(rendered.body)}"`
  );
}

async function dispatch(
  templateName: EmailTemplateName,
  recipientRole: EmailRecipientRole,
  recipientEmail: string | undefined,
  reference: string,
  rendered: RenderedEmail
): Promise<void> {
  if (!env.emailEnabled) return; // safe no-op — the default state

  if (!recipientEmail) {
    console.warn(`[email] No recipient configured for template "${templateName}" (ref="${reference}") — skipped.`);
    return;
  }

  if (env.emailProvider === "console") {
    logConsoleEmail(templateName, recipientRole, recipientEmail, reference, rendered);
    return;
  }

  // No real provider is integrated yet. A future milestone that adds
  // Resend/SendGrid/SMTP replaces this branch with a real send, still
  // behind the same env.emailEnabled gate above.
  console.warn(
    `[email] EMAIL_PROVIDER="${env.emailProvider}" is not implemented yet — no email was sent for template "${templateName}".`
  );
}

export async function sendOrderCreatedEmail(order: OrderEmailData): Promise<void> {
  await dispatch("order-created", "customer", order.customerEmail, order.orderNumber, renderOrderCreatedEmail(order));
}

export async function sendPaymentPendingEmail(order: OrderEmailData): Promise<void> {
  await dispatch("payment-pending", "customer", order.customerEmail, order.orderNumber, renderPaymentPendingEmail(order));
}

export async function sendPaymentConfirmedEmail(order: OrderEmailData): Promise<void> {
  await dispatch("payment-confirmed", "customer", order.customerEmail, order.orderNumber, renderPaymentConfirmedEmail(order));
}

export async function sendPaymentFailedEmail(order: OrderEmailData): Promise<void> {
  await dispatch(
    "payment-failed-or-cancelled",
    "customer",
    order.customerEmail,
    order.orderNumber,
    renderPaymentFailedOrCancelledEmail(order)
  );
}

export async function sendEnquiryReceivedEmail(enquiry: EnquiryEmailData): Promise<void> {
  await dispatch("enquiry-received", "customer", enquiry.email, enquiry.id, renderEnquiryReceivedEmail(enquiry));
}

export async function sendAdminNewOrderEmail(order: OrderEmailData): Promise<void> {
  await dispatch("admin-new-order", "admin", env.adminNotificationEmail, order.orderNumber, renderAdminNewOrderEmail(order));
}

export async function sendAdminNewEnquiryEmail(enquiry: EnquiryEmailData): Promise<void> {
  await dispatch("admin-new-enquiry", "admin", env.adminNotificationEmail, enquiry.id, renderAdminNewEnquiryEmail(enquiry));
}
