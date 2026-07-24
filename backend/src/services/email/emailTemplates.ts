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

import type { EnquiryEmailData, OrderEmailData, OrderEmailItem, RenderedEmail } from "./email.types.js";

const CONTACT_LINE = "If you have any questions, just reply to this email or reach us through our Contact page.";

// Version 7, Milestone 117: explicit contact details for the
// order-created customer email specifically — the same real,
// already-public WhatsApp number used everywhere else on the site,
// and the reply-to inbox this email's own "Reply" button actually
// reaches (Brevo's replyTo, set to this same address).
const ORDER_CONTACT_BLOCK = `Seasonedz Group
Email: seasonedzgroup@outlook.com
WhatsApp: +27 72 844 5644`;

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

function formatItemsList(items: OrderEmailItem[]): string {
  return items.map((item) => `- ${item.productName} x${item.quantity} — ${formatRand(item.lineTotal)}`).join("\n");
}

function formatDeliveryNote(order: OrderEmailData): string {
  const lines = [
    order.deliveryStreetAddress,
    order.deliverySuburb,
    `${order.deliveryCity}, ${order.deliveryProvince} ${order.deliveryPostalCode}`.trim(),
  ];
  if (order.deliveryNotes) lines.push(`Notes: ${order.deliveryNotes}`);
  return lines.filter(Boolean).join("\n");
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

export function renderOrderCreatedEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Your Seasonedz Group Order ${order.orderNumber} Has Been Received`;
  const body = `Hi ${order.customerFirstName},

Thank you for your order with Seasonedz Group! We've received order ${order.orderNumber} and it's now being processed.

Items Ordered:
${formatItemsList(order.items)}

Order Total: ${formatRand(order.total)}
Payment Method: ${humanizeEnum(order.paymentMethod)}
Payment Status: ${humanizeEnum(order.paymentStatus)}

${paymentInstructions(order.paymentMethod)}

Delivering To:
${formatDeliveryNote(order)}

Delivery is arranged manually by our small team once your order is confirmed — we'll be in touch with tracking details once it's packed and booked.

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

export function renderPaymentConfirmedEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Payment Confirmed for Order ${order.orderNumber}`;
  const body = `Hi ${order.customerFirstName},

Good news: your payment for order ${order.orderNumber} has been confirmed. Thank you!

Order Total: ${formatRand(order.total)}
Payment Status: ${humanizeEnum(order.paymentStatus)}

We're now getting your order ready. You're welcome to check its progress any time using your order number.

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
      ? "\n\nThis is a Bank Transfer order — check the business bank account and confirm payment before packing."
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
Payment Status: ${humanizeEnum(order.paymentStatus)}${bankTransferReminder}

Delivering To:
${formatDeliveryNote(order)}

Please review this order in the admin dashboard and prepare it for processing.`;

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
