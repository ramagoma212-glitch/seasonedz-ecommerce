// Email service (Version 3, Milestone 24 — preparation only).
//
// No real email is sent by anything in this file:
//  - EMAIL_ENABLED=false (the default) makes every send*Email function
//    a safe no-op.
//  - EMAIL_PROVIDER="console" (the only supported value right now)
//    logs only safe metadata — template name, a masked recipient
//    address, and an order number/enquiry id. It never logs the
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
  renderOrderCreatedEmail,
  renderPaymentConfirmedEmail,
  renderPaymentFailedOrCancelledEmail,
} from "./emailTemplates.js";
import type { EmailTemplateName, EnquiryEmailData, OrderEmailData, RenderedEmail } from "./email.types.js";

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

function logConsoleEmail(templateName: EmailTemplateName, recipientEmail: string, reference: string, rendered: RenderedEmail): void {
  console.log(
    `[email:console] template="${templateName}" to="${maskEmail(recipientEmail)}" ref="${reference}" subject="${rendered.subject}"`
  );
}

async function dispatch(
  templateName: EmailTemplateName,
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
    logConsoleEmail(templateName, recipientEmail, reference, rendered);
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
  await dispatch("order-created", order.customerEmail, order.orderNumber, renderOrderCreatedEmail(order));
}

export async function sendPaymentConfirmedEmail(order: OrderEmailData): Promise<void> {
  await dispatch("payment-confirmed", order.customerEmail, order.orderNumber, renderPaymentConfirmedEmail(order));
}

export async function sendPaymentFailedEmail(order: OrderEmailData): Promise<void> {
  await dispatch("payment-failed-or-cancelled", order.customerEmail, order.orderNumber, renderPaymentFailedOrCancelledEmail(order));
}

export async function sendAdminNewOrderEmail(order: OrderEmailData): Promise<void> {
  await dispatch("admin-new-order", env.adminNotificationEmail, order.orderNumber, renderAdminNewOrderEmail(order));
}

export async function sendAdminNewEnquiryEmail(enquiry: EnquiryEmailData): Promise<void> {
  await dispatch("admin-new-enquiry", env.adminNotificationEmail, enquiry.id, renderAdminNewEnquiryEmail(enquiry));
}
