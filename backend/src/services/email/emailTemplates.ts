// Email template rendering (Version 3, Milestone 24 — preparation
// only). Plain-text bodies, kept simple, professional and warm rather
// than salesy — South African English throughout ("colouring", not
// "coloring"). Nothing here sends anything; see email.service.ts.
//
// No fake bank account details are ever included — bank transfer
// orders use a placeholder line, exactly as instructed, until
// Seasonedz Group's real banking details are safely configured
// somewhere (not yet, and not part of this milestone).

import type { EnquiryEmailData, OrderEmailData, RenderedEmail } from "./email.types.js";

const CONTACT_LINE = "If you have any questions, just reply to this email or reach us through our Contact page.";

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

function paymentInstructions(paymentMethod: string): string {
  switch (paymentMethod) {
    case "BANK_TRANSFER":
      return "Bank transfer details will be shared by Seasonedz Group.";
    case "PAYFAST":
      return "Your PayFast payment is being processed — we'll email you again as soon as it's confirmed.";
    case "CASH_ON_DELIVERY":
      return "You'll pay by cash or card when your order is delivered.";
    default:
      return "Seasonedz Group will be in touch with next steps for payment.";
  }
}

export function renderOrderCreatedEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Your Seasonedz Group Order ${order.orderNumber} Has Been Received`;
  const body = `Hi ${order.customerFirstName},

Thank you for your order with Seasonedz Group! We've received order ${order.orderNumber} and it's now being processed.

Order Total: ${formatRand(order.total)}
Payment Method: ${humanizeEnum(order.paymentMethod)}
Payment Status: ${humanizeEnum(order.paymentStatus)}

${paymentInstructions(order.paymentMethod)}

${CONTACT_LINE}

Warm regards,
Seasonedz Group`;

  return { subject, body };
}

export function renderPaymentConfirmedEmail(order: OrderEmailData): RenderedEmail {
  const subject = `Payment Confirmed for Order ${order.orderNumber}`;
  const body = `Hi ${order.customerFirstName},

Good news — your payment for order ${order.orderNumber} has been confirmed. Thank you!

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

export function renderAdminNewOrderEmail(order: OrderEmailData): RenderedEmail {
  const subject = `New Order Received: ${order.orderNumber}`;
  const body = `A new order has been placed on Seasonedz Group.

Order Number: ${order.orderNumber}
Customer: ${order.customerFirstName} ${order.customerLastName}
Order Total: ${formatRand(order.total)}
Payment Method: ${humanizeEnum(order.paymentMethod)}
Payment Status: ${humanizeEnum(order.paymentStatus)}

Please review this order and prepare it for processing.`;

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
