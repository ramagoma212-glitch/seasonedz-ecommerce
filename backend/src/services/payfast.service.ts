// PayFast payment initiation (Milestone 21), ITN/payment verification
// (Milestone 22), and source verification hardening (Version 4,
// Milestone 29).
//
// initiatePayfastPayment() prepares the exact form fields + signature
// a frontend can POST to redirect a customer to PayFast's sandbox or
// production payment page. It never marks an order as paid.
//
// processPayfastNotification() is the only code path in this backend
// allowed to mark an order as paid — and only after verifying the
// notification really came from PayFast (signature, and optionally
// source IP + PayFast server confirmation — see below) and really
// matches the order it claims to (amount, order lookup). A browser
// redirect back from PayFast (return_url/cancel_url) is never treated
// as proof of anything here; those exist purely for customer
// navigation and are handled entirely by the frontend.
//
// Every field/amount used in both directions is sourced from the
// backend's own Order record — never from anything a client sends —
// so the amount PayFast is asked to charge (and later asked to
// confirm) always matches what was actually verified at checkout.
//
// PAYFAST_VERIFY_SOURCE and PAYFAST_VALIDATE_SERVER (both default
// false) add two further, independent checks on top of the above —
// never instead of it. See
// backend/VERSION_4_PAYFAST_SOURCE_VERIFICATION.md.

import type { Request } from "express";
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { payfastConfig } from "../config/payfast.js";
import { env } from "../config/env.js";
import { generatePayfastSignature, verifyPayfastSignature } from "../utils/payfastSignature.js";
import { verifyPayfastSource } from "../utils/payfastSourceVerification.js";
import { validateWithPayfastServer } from "../utils/payfastServerValidation.js";

// Shared by both payment initiation (Milestone 21) and ITN
// verification (Milestone 22) — both are "something about this
// payment request/notification is invalid" errors reported the same
// way (a message + an HTTP status code the controller maps directly).
export class PaymentError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PaymentError";
    this.statusCode = statusCode;
  }
}

export interface PayfastInitiationResult {
  processUrl: string;
  method: "POST";
  fields: Record<string, string>;
}

// Shared by initiatePayfastPayment's eligibility check (Version 4,
// Milestone 31) and processPayfastNotification's "COMPLETE" guard
// below — a customer retrying a PayFast payment must be allowed to
// both start a new attempt (initiate) and have that attempt actually
// succeed (a later COMPLETE ITN), so both checks use the same list.
// PAID and REFUNDED are deliberately excluded from both: a paid or
// refunded order is never re-chargeable, retry or not.
const PAYFAST_RETRY_ELIGIBLE_STATUSES: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.FAILED, PaymentStatus.CANCELLED];

// The configured return_url/cancel_url point at this frontend's
// hash-based router (e.g. "http://localhost:5173/#/payment-success"),
// so the payment-success/payment-cancelled pages (Milestone 23) know
// which order to look up. A plain query string appended before the
// "#" would never reach the router at all (everything after "#" is a
// fragment the browser never sends to a server, and the SPA itself
// only ever reads its own route/query out of that fragment) — so the
// order number must be appended *inside* the fragment instead. Simple
// string concatenation is enough: whatever comes after "#" is just a
// string our own router.js parses (path, then "?", then query) — it
// isn't interpreted by the browser, so there's no real URL-parsing
// rule to violate here, unlike a normal (non-fragment) query string.
function appendOrderNumberToUrl(baseUrl: string | undefined, orderNumber: string): string | undefined {
  if (!baseUrl) return undefined;
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}orderNumber=${encodeURIComponent(orderNumber)}`;
}

export async function initiatePayfastPayment(orderNumber: string): Promise<PayfastInitiationResult> {
  if (!payfastConfig.enabled) {
    throw new PaymentError("PayFast payments are not enabled.", 503);
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { items: true },
  });

  if (!order) {
    throw new PaymentError(`Order not found: ${orderNumber}`, 404);
  }

  if (order.paymentMethod !== PaymentMethod.PAYFAST) {
    throw new PaymentError("This order was not created for PayFast payment.", 400);
  }

  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
    throw new PaymentError("This order has been cancelled or refunded and cannot be paid.", 400);
  }

  // Version 4, Milestone 31: PENDING (first attempt), FAILED and
  // CANCELLED (retry) may all initiate a new PayFast payment attempt —
  // PAID and REFUNDED may not. This never creates a new Payment row
  // (the update below reuses the existing one) and never touches
  // stock (already decremented once, at order creation).
  if (!PAYFAST_RETRY_ELIGIBLE_STATUSES.includes(order.paymentStatus)) {
    throw new PaymentError("This order's payment has already been processed.", 400);
  }

  if (order.total.lte(0)) {
    throw new PaymentError("Order total must be greater than zero.", 400);
  }

  // payfastConfig.enabled === true means config/env.ts already verified
  // these are all set at startup — this check only narrows the types
  // for TypeScript and guards against the config module ever changing.
  if (!payfastConfig.merchantId || !payfastConfig.merchantKey || !payfastConfig.returnUrl || !payfastConfig.cancelUrl || !payfastConfig.notifyUrl) {
    throw new PaymentError("PayFast is not fully configured.", 503);
  }

  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  // Insertion order matters here — it must match the order the same
  // fields are later rendered into a <form> and submitted to PayFast,
  // since the signature is computed over this exact sequence.
  const fields: Record<string, string | undefined> = {
    merchant_id: payfastConfig.merchantId,
    merchant_key: payfastConfig.merchantKey,
    return_url: appendOrderNumberToUrl(payfastConfig.returnUrl, order.orderNumber),
    cancel_url: appendOrderNumberToUrl(payfastConfig.cancelUrl, order.orderNumber),
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

// ---------------------------------------------------------------------------
// ITN (Instant Transaction Notification) verification — Milestone 22.
// ---------------------------------------------------------------------------
//
// This is the *only* place in the backend allowed to set
// paymentStatus: PAID. A customer's browser being redirected back to
// return_url proves nothing — it's just navigation, and PayFast itself
// documents that the ITN (a separate server-to-server POST to
// notify_url) is the only trustworthy confirmation of a payment
// outcome. Every check below exists to make sure this POST really came
// from PayFast and really matches the order it claims to.

function fieldAsString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export interface PayfastNotifyResult {
  message: string;
}

// `req` is used only for source verification (Step 5 below), when
// PAYFAST_VERIFY_SOURCE is enabled — passed through from the
// controller rather than reconstructed here, since Express's Request
// is what actually carries the resolved req.ip (see app.ts's
// TRUST_PROXY handling and utils/payfastSourceVerification.ts).
export async function processPayfastNotification(rawBody: Record<string, unknown>, req: Request): Promise<PayfastNotifyResult> {
  if (!payfastConfig.enabled) {
    throw new PaymentError("PayFast payments are not enabled.", 503);
  }

  // --- Step 1: basic field presence (Milestone 22, task 5) -----------------
  // amount_fee/amount_net/item_name/email_address are also present on a
  // real PayFast ITN (task 4 lists them for completeness) but aren't
  // read here: there's no schema field to store them in yet (see the
  // Milestone 19 audit's "providerPayload" discussion), and none of
  // them are needed for the verification/eligibility logic below.
  const mPaymentId = fieldAsString(rawBody.m_payment_id);
  const paymentStatusRaw = fieldAsString(rawBody.payment_status);
  const amountGrossRaw = fieldAsString(rawBody.amount_gross);
  const signature = fieldAsString(rawBody.signature);
  const merchantId = fieldAsString(rawBody.merchant_id);
  const pfPaymentId = fieldAsString(rawBody.pf_payment_id);

  const missingFields: string[] = [];
  if (!mPaymentId) missingFields.push("m_payment_id");
  if (!paymentStatusRaw) missingFields.push("payment_status");
  if (!amountGrossRaw) missingFields.push("amount_gross");
  if (!signature) missingFields.push("signature");
  if (!merchantId) missingFields.push("merchant_id");

  if (missingFields.length > 0) {
    throw new PaymentError(`Missing required PayFast notification field(s): ${missingFields.join(", ")}`, 400);
  }

  // Non-null: the check above already confirmed every one of these is
  // present — asserted here so TypeScript's control-flow analysis
  // (which doesn't follow "pushed to an array, therefore defined")
  // doesn't require repeating the same runtime check.
  const verifiedSignature = signature as string;
  const verifiedAmountGrossRaw = amountGrossRaw as string;

  if (merchantId !== payfastConfig.merchantId) {
    throw new PaymentError("PayFast merchant ID does not match.", 400);
  }

  // --- Step 2: signature verification (task 6) ------------------------------
  // Signed over every field PayFast actually posted (in the order it
  // posted them), minus "signature" itself — never just the subset of
  // fields read above, since PayFast signs the whole notification.
  const signatureFields: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(rawBody)) {
    if (key === "signature") continue;
    signatureFields[key] = typeof value === "string" ? value : undefined;
  }

  const signatureValid = verifyPayfastSignature(signatureFields, verifiedSignature, payfastConfig.passphrase);
  if (!signatureValid) {
    // 403, not 400: this specifically means "we can't verify this
    // request actually came from PayFast" — distinct from an
    // otherwise-well-formed request with a business-rule problem.
    throw new PaymentError("Invalid PayFast signature.", 403);
  }

  let amountGross: Prisma.Decimal;
  try {
    amountGross = new Prisma.Decimal(verifiedAmountGrossRaw);
  } catch {
    throw new PaymentError("amount_gross is not a valid number.", 400);
  }

  // --- Step 3: order lookup + amount verification (task 7) -----------------
  const order = await prisma.order.findUnique({
    where: { orderNumber: mPaymentId },
    include: { payment: true },
  });

  if (!order) {
    throw new PaymentError(`Order not found: ${mPaymentId}`, 404);
  }

  // Must match exactly — comparing as Decimal (not strings) so
  // "918", "918.0" and "918.00" are all correctly treated as equal.
  if (!amountGross.eq(order.total)) {
    throw new PaymentError("Amount does not match the order total on record.", 400);
  }

  // --- Step 4: eligibility (task 8) -----------------------------------------
  if (order.paymentMethod !== PaymentMethod.PAYFAST) {
    throw new PaymentError("This order was not created for PayFast payment.", 400);
  }

  if (!order.payment) {
    throw new PaymentError("This order has no payment record.", 400);
  }

  if (order.payment.provider !== null && order.payment.provider !== "PAYFAST") {
    throw new PaymentError("This order's payment was not processed via PayFast.", 400);
  }

  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
    throw new PaymentError("This order has been cancelled or refunded and cannot be updated.", 400);
  }

  // --- Step 5: source verification (Version 4, Milestone 29 — off by default) ---
  // Disabled (the default): this step doesn't run at all, and nothing
  // below changes — existing behaviour from Milestone 22 is preserved
  // exactly. Enabled: a source that doesn't resolve back to one of
  // PayFast's own domains is a hard rejection, never a warning — see
  // utils/payfastSourceVerification.ts for why this can only be
  // meaningfully proven against real PayFast traffic, not crafted
  // local requests.
  if (env.payfastVerifySource) {
    const sourceValid = await verifyPayfastSource(req, payfastConfig.mode);
    if (!sourceValid) {
      // 403: the same "we can't verify this actually came from
      // PayFast" class of failure as the signature check above.
      throw new PaymentError("PayFast source verification failed.", 403);
    }
  }

  // --- Step 6: server validation (Version 4, Milestone 29 — off by default) ---
  // Disabled (the default): skipped entirely. Enabled: PayFast's own
  // "VALID"/"INVALID" confirmation is required before trusting this
  // notification — see utils/payfastServerValidation.ts. A network
  // failure or timeout talking to PayFast is treated exactly the same
  // as an explicit "INVALID", never as a pass.
  if (env.payfastValidateServer) {
    const serverValid = await validateWithPayfastServer(rawBody, payfastConfig.mode);
    if (!serverValid) {
      // 400, not 403: PayFast's own infrastructure was reachable and
      // responded — this is "the data didn't check out", the same
      // class of failure as the amount/merchant-ID checks above,
      // distinct from "we couldn't verify this is from PayFast" at
      // all (signature/source, which are 403).
      throw new PaymentError("PayFast server validation failed.", 400);
    }
  }

  // --- Step 7: status mapping + idempotency (tasks 9-10) --------------------
  // Stock is never touched here — it was already decremented once, at
  // order creation (Milestone 13). Nothing below writes to
  // Product.stockQuantity.
  const providerReference = pfPaymentId || mPaymentId;

  switch (paymentStatusRaw) {
    case "COMPLETE": {
      if (order.paymentStatus === PaymentStatus.PAID) {
        // Idempotent: PayFast documents that the same ITN can be sent
        // more than once. Never re-create records, never touch stock
        // again — just acknowledge safely.
        return { message: "Payment already recorded as PAID; duplicate notification acknowledged." };
      }

      // Version 4, Milestone 31: must mirror initiatePayfastPayment's
      // eligibility exactly — a retried payment (from FAILED or
      // CANCELLED) has to be allowed to actually complete here, or
      // retry would be initiable but silently doomed to fail at this
      // step.
      if (!PAYFAST_RETRY_ELIGIBLE_STATUSES.includes(order.paymentStatus)) {
        throw new PaymentError("Order payment status does not allow marking as paid.", 400);
      }

      await prisma.$transaction([
        prisma.payment.update({
          where: { orderId: order.id },
          data: {
            status: PaymentStatus.PAID,
            provider: "PAYFAST",
            providerReference,
            amount: amountGross,
            paidAt: new Date(),
            failureReason: null,
          },
        }),
        prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: PaymentStatus.PAID, status: OrderStatus.CONFIRMED },
        }),
      ]);

      return { message: "Payment verified and marked as PAID." };
    }

    case "FAILED": {
      if (order.paymentStatus === PaymentStatus.PAID) {
        // A stale/out-of-order FAILED notification must never
        // downgrade an order that's already genuinely PAID — ITN
        // delivery order isn't guaranteed.
        return { message: "Order already PAID; FAILED notification acknowledged without changes." };
      }

      // order.status deliberately stays as-is (PENDING) rather than
      // becoming CANCELLED — documented decision, see
      // PAYFAST_SETUP.md's "FAILED / CANCELLED order.status decision":
      // a single failed payment attempt shouldn't by itself cancel the
      // whole order, since the customer may still retry payment.
      await prisma.payment.update({
        where: { orderId: order.id },
        data: {
          status: PaymentStatus.FAILED,
          provider: "PAYFAST",
          providerReference,
          failureReason: "PayFast reported payment_status=FAILED.",
        },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: PaymentStatus.FAILED },
      });

      return { message: "Payment marked as FAILED." };
    }

    case "CANCELLED": {
      if (order.paymentStatus === PaymentStatus.PAID) {
        return { message: "Order already PAID; CANCELLED notification acknowledged without changes." };
      }

      // Same documented decision as FAILED above: order.status is left
      // untouched.
      await prisma.payment.update({
        where: { orderId: order.id },
        data: {
          status: PaymentStatus.CANCELLED,
          provider: "PAYFAST",
          providerReference,
        },
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: PaymentStatus.CANCELLED },
      });

      return { message: "Payment marked as CANCELLED." };
    }

    default: {
      // Any other PayFast status: never mark as paid, but keep a safe
      // record of what was reported for later investigation rather
      // than silently discarding it.
      await prisma.payment.update({
        where: { orderId: order.id },
        data: { failureReason: `Unrecognized PayFast payment_status: ${paymentStatusRaw}` },
      });

      return { message: "Notification acknowledged (unrecognized status, no change made)." };
    }
  }
}
