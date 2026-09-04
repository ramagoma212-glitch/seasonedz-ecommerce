// Version 7, Milestone 172B.6: manual payment confirmation — the
// backend fix for a real, pre-existing gap 172B.5's own audit found:
// PayFast is the only payment method with any automated path to
// Payment.status = PAID (the verified ITN in payfast.service.ts).
// Bank Transfer and Cash on Delivery settle outside this system
// entirely (a real bank transfer, or real cash/card handed over on
// delivery) — nothing here can ever confirm that on its own, so an
// admin who has genuinely already verified it (checked the bank
// statement; collected the cash) records that fact through this
// action. It is deliberately the ONLY code path in this backend
// (besides the verified PayFast ITN) ever allowed to write
// Payment.status = PAID.
//
// PayFast protection: this file has no code path for PAYFAST orders at
// all — confirmManualPayment() rejects any method other than
// BANK_TRANSFER/CASH_ON_DELIVERY outright. PayFast's own payment state
// continues to come exclusively from payfast.service.ts's verified ITN
// flow, completely untouched by this milestone.
//
// Order.status is deliberately NEVER touched here — only
// Payment.status/paidAt. Unlike PayFast's ITN handler (which also
// advances Order.status PENDING -> CONFIRMED, since a real online
// payment reliably precedes any manual admin progress on the order), a
// Bank Transfer/COD order's status may already be well ahead of
// "payment confirmed" by the time an admin gets to bank statements or
// cash reconciliation (COD in particular: payment is only even
// possible to confirm AFTER delivery — see the COD-specific gate
// below) — forcibly resetting Order.status back to CONFIRMED here
// would be a real regression, not a safe default.
//
// Commission eligibility (172B.5) needs nothing new: it already reads
// Payment.status directly, so a referred Bank Transfer/COD order's
// commission becomes payment-eligible the instant this action runs,
// automatically, with zero changes to commissionEligibility.service.ts.
// Fulfilment and the 30-day validation window are still independently
// required, exactly as before — this action only ever makes the
// PAYMENT condition true, never a commission-approval shortcut.
//
// "Acting admin" is not stored in a queryable database column —
// Payment has no admin-attribution field, and adding one was judged
// not worth a migration for this milestone (same call already made for
// the commission lifecycle in 172B.5). Every confirmation instead
// writes one structured, narrow console.log line (admin id/email,
// order number, timestamp) — the same audit discipline established
// there.

import { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import type { SafeAdminProfile } from "./adminAuth.service.js";
import { scheduleProductReviewRequestForDigitalOrder } from "./productReviewRequest.service.js";
import { consumePreorderDiscountRedemption } from "./preorderDiscountRedemption.service.js";

export class ManualPaymentConfirmationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ManualPaymentConfirmationError";
    this.statusCode = statusCode;
  }
}

// The only two payment methods a real checkout can ever produce that
// settle outside this system — see order.validator.ts/mappers.js.
// PaymentMethod.MANUAL is deliberately excluded: no code path in this
// frontend can ever produce it (checkout only ever sends bank-transfer,
// payfast, or cash-on-delivery — see src/js/api/mappers.js), so it's a
// reserved-but-currently-unreachable enum value this action has no
// reason to touch.
const MANUALLY_CONFIRMABLE_METHODS: PaymentMethod[] = [PaymentMethod.BANK_TRANSFER, PaymentMethod.CASH_ON_DELIVERY];

function logManualPaymentConfirmation(params: { orderNumber: string; paymentMethod: PaymentMethod; adminId: string; adminEmail: string }): void {
  // eslint-disable-next-line no-console
  console.log(
    `[manual-payment-confirmation] order=${params.orderNumber} method=${params.paymentMethod} adminId=${params.adminId} adminEmail=${params.adminEmail} at=${new Date().toISOString()}`
  );
}

export interface ManualPaymentConfirmationResult {
  orderNumber: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paidAt: Date | null;
  amount: number;
}

// Concurrency safety (double-confirmation, concurrent confirmation):
// the actual write is a single conditional updateMany scoped to
// `status: { not: PAID }` — if a second, simultaneous request already
// confirmed the same order between this function's read and its write,
// the affected count comes back 0 and the whole transaction is rolled
// back with a clear error, never a duplicate/overwritten confirmation.
export async function confirmManualPayment(orderNumber: string, admin: SafeAdminProfile): Promise<ManualPaymentConfirmationResult> {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { orderNumber },
      include: { payment: true },
    });

    if (!order) {
      throw new ManualPaymentConfirmationError(`Order not found: ${orderNumber}`, 404);
    }
    if (!order.payment) {
      throw new ManualPaymentConfirmationError("This order has no payment record.", 409);
    }

    if (!MANUALLY_CONFIRMABLE_METHODS.includes(order.paymentMethod)) {
      throw new ManualPaymentConfirmationError(
        "Manual payment confirmation is only available for Bank Transfer and Cash on Delivery orders. PayFast payment state comes only from the verified PayFast notification.",
        409
      );
    }

    if (order.payment.status === PaymentStatus.PAID) {
      throw new ManualPaymentConfirmationError("This order's payment has already been confirmed.", 409);
    }

    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.REFUNDED) {
      throw new ManualPaymentConfirmationError("This order has been cancelled or refunded and cannot be marked as paid.", 409);
    }

    // Cash on Delivery: payment can only genuinely have been received
    // once delivery/collection has actually happened — confirming it
    // any earlier would be recording something that cannot yet be
    // true. Bank Transfer has no such ordering constraint: the money
    // can arrive at any point relative to the order's own fulfilment
    // progress.
    if (order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY && order.status !== OrderStatus.DELIVERED) {
      throw new ManualPaymentConfirmationError(
        "Cash on Delivery payment can only be confirmed once the order has been marked Delivered.",
        409
      );
    }

    const paidAt = new Date();
    const updateResult = await tx.payment.updateMany({
      where: { orderId: order.id, status: { not: PaymentStatus.PAID } },
      data: { status: PaymentStatus.PAID, paidAt, provider: "MANUAL_ADMIN_CONFIRMATION", failureReason: null },
    });

    if (updateResult.count === 0) {
      // A concurrent request already confirmed this exact order between
      // the check above and this write.
      throw new ManualPaymentConfirmationError("This order's payment was just confirmed by another request. Please refresh.", 409);
    }

    // Order.paymentStatus is a separate column from Payment.status (see
    // schema.prisma) that must be kept in sync — the same two-fields-
    // one-concept discipline payfast.service.ts's own COMPLETE branch
    // already follows for a PayFast payment, and adminShipping.service.ts
    // follows for Order.fulfilmentStatus/Shipping.status. Deliberately
    // never touches Order.status itself — see this file's own header
    // comment for why.
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: PaymentStatus.PAID } });

    // Milestone 181, Part F: same consumption hook as payfast.service.ts's
    // own COMPLETE branch — Payment.status reaching PAID is the one
    // moment shared by every payment method's own transaction.
    await consumePreorderDiscountRedemption(tx, order.id);

    // Payment.amount is never touched here — it stays exactly what
    // order.service.ts's createOrder() originally set from verified,
    // server-derived order totals. The admin confirms receipt of that
    // existing, authoritative amount; there is no field anywhere in
    // this request for a replacement figure to even be typed into.
    logManualPaymentConfirmation({ orderNumber: order.orderNumber, paymentMethod: order.paymentMethod, adminId: admin.id, adminEmail: admin.email });

    return {
      orderNumber: order.orderNumber,
      paymentMethod: order.paymentMethod,
      paymentStatus: PaymentStatus.PAID,
      paidAt,
      amount: (order.payment.amount as Prisma.Decimal).toNumber(),
    };
  });

  // Version 7, Milestone 174C: strictly after the transaction above has
  // committed, same discipline as every other post-commit notification
  // hook in this codebase. Only ever actually schedules anything for a
  // 100%-digital order (the function's own internal check) — see
  // productReviewRequest.service.ts's own header comment. A Cash on
  // Delivery digital order is a real (if unusual) combination this
  // still handles correctly: the gate above already requires the order
  // to be DELIVERED before COD payment can be confirmed at all, but
  // "delivered" and "digital" are independent facts — this call only
  // ever fires the digital-payment-based schedule, never a duplicate
  // of the delivery-based one, since a genuinely mixed order is always
  // rejected by the function's own hasPhysicalItems check.
  void scheduleProductReviewRequestForDigitalOrder(result.orderNumber, result.paidAt).catch(() => {});

  return result;
}
