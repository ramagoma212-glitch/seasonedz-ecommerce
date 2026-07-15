// PayFast payment initiation (Version 3, Milestone 21).
//
// Prepares the exact form fields + signature a frontend will (in a
// later milestone) POST to PayFast to redirect a customer to the
// sandbox/production payment page. Nothing here marks an order as
// paid, calls PayFast, or handles PayFast's response — this is
// preparation only. ITN (payment notification) verification, the
// *only* trustworthy source of a real payment outcome, is later work.
//
// Every field is built from the backend's own Order record — never
// from anything a client sends — so the amount PayFast is asked to
// charge always matches what was actually verified at checkout.

import { OrderStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { payfastConfig } from "../config/payfast.js";
import { generatePayfastSignature } from "../utils/payfastSignature.js";

export class PaymentInitiationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PaymentInitiationError";
    this.statusCode = statusCode;
  }
}

export interface PayfastInitiationResult {
  processUrl: string;
  method: "POST";
  fields: Record<string, string>;
}

export async function initiatePayfastPayment(orderNumber: string): Promise<PayfastInitiationResult> {
  if (!payfastConfig.enabled) {
    throw new PaymentInitiationError("PayFast payments are not enabled.", 503);
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });

  if (!order) {
    throw new PaymentInitiationError(`Order not found: ${orderNumber}`, 404);
  }

  if (order.paymentMethod !== PaymentMethod.PAYFAST) {
    throw new PaymentInitiationError("This order was not created for PayFast payment.", 400);
  }

  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
    throw new PaymentInitiationError("This order has been cancelled or refunded and cannot be paid.", 400);
  }

  if (order.paymentStatus !== PaymentStatus.PENDING) {
    throw new PaymentInitiationError("This order's payment has already been processed.", 400);
  }

  if (order.total.lte(0)) {
    throw new PaymentInitiationError("Order total must be greater than zero.", 400);
  }

  // payfastConfig.enabled === true means config/env.ts already verified
  // these are all set at startup — this check only narrows the types
  // for TypeScript and guards against the config module ever changing.
  if (!payfastConfig.merchantId || !payfastConfig.merchantKey || !payfastConfig.returnUrl || !payfastConfig.cancelUrl || !payfastConfig.notifyUrl) {
    throw new PaymentInitiationError("PayFast is not fully configured.", 503);
  }

  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  // Insertion order matters here — it must match the order the same
  // fields are later rendered into a <form> and submitted to PayFast,
  // since the signature is computed over this exact sequence.
  const fields: Record<string, string | undefined> = {
    merchant_id: payfastConfig.merchantId,
    merchant_key: payfastConfig.merchantKey,
    return_url: payfastConfig.returnUrl,
    cancel_url: payfastConfig.cancelUrl,
    notify_url: payfastConfig.notifyUrl,
    name_first: order.customerFirstName,
    name_last: order.customerLastName,
    email_address: order.customerEmail,
    cell_number: order.customerPhone || undefined,
    m_payment_id: order.orderNumber,
    amount: order.total.toFixed(2),
    item_name: `Seasonedz Group Order ${order.orderNumber}`,
    item_description: `${itemCount} item(s) — Seasonedz Group order ${order.orderNumber}`,
  };

  const signature = generatePayfastSignature(fields, payfastConfig.passphrase);

  const submittedFields: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== "") submittedFields[key] = value;
  }
  submittedFields.signature = signature;

  // Record that a PayFast payment attempt was prepared for this order
  // — paymentStatus stays PENDING and stock is untouched. Only a
  // verified ITN (later milestone) may ever move paymentStatus to PAID.
  await prisma.payment.update({
    where: { orderId: order.id },
    data: {
      provider: "PAYFAST",
      providerReference: order.orderNumber,
    },
  });

  return {
    processUrl: payfastConfig.processUrl,
    method: "POST",
    fields: submittedFields,
  };
}
