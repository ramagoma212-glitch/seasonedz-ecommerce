// Milestone 181, Part F: the reserve/consume/release lifecycle behind
// the one-time first-registered-customer preorder discount — see
// PreorderDiscountRedemption's own schema comment for the full design
// and why a bare `customer.hasUsedPreorderDiscount` boolean was
// rejected. Every function here takes an already-open Prisma
// transaction client (never opens its own) — callers
// (order.service.ts, payfast.service.ts, adminPaymentConfirmation.service.ts,
// adminOrderStatus.service.ts) are each already inside their own
// transaction at the exact moment these need to run, so reservation is
// atomic with order creation, consumption is atomic with the payment-
// status write, and release is atomic with the order-status write.

import { Prisma, PreorderDiscountRedemptionStatus } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export class PreorderDiscountRedemptionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = "PreorderDiscountRedemptionError";
    this.statusCode = statusCode;
  }
}

const ACTIVE_STATUSES: PreorderDiscountRedemptionStatus[] = [PreorderDiscountRedemptionStatus.RESERVED, PreorderDiscountRedemptionStatus.CONSUMED];

// Best-effort, pre-transaction eligibility read — decides whether THIS
// checkout attempt even tries to apply the discount (and therefore what
// figures get baked into the order/OrderItem rows about to be created).
// Not itself the concurrency guarantee: the real guarantee is the
// partial unique index behind reservePreorderDiscount() below, which a
// genuinely concurrent second attempt will still hit even if this read
// raced past it.
export async function hasActivePreorderDiscountRedemption(client: Tx | Prisma.TransactionClient, customerId: string): Promise<boolean> {
  const existing = await client.preorderDiscountRedemption.findFirst({
    where: { customerId, status: { in: ACTIVE_STATUSES } },
    select: { id: true },
  });
  return existing !== null;
}

// Reserves the customer's one-time benefit — must be called with the
// order row already created (orderId is required), inside the SAME
// transaction. A concurrent reservation attempt for the same customer
// (two simultaneous checkouts) hits the database's own partial unique
// index and this throws; the caller lets that propagate and roll back
// the entire transaction (order, stock decrement, everything) rather
// than ever persist an order whose total already has the discount
// baked in with no matching reservation.
export async function reservePreorderDiscount(
  tx: Tx,
  params: { customerId: string; orderId: string; discountPercent: Prisma.Decimal; discountAmount: Prisma.Decimal }
): Promise<void> {
  try {
    await tx.preorderDiscountRedemption.create({
      data: {
        customerId: params.customerId,
        orderId: params.orderId,
        status: PreorderDiscountRedemptionStatus.RESERVED,
        discountPercentSnapshot: params.discountPercent,
        discountAmountSnapshot: params.discountAmount,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new PreorderDiscountRedemptionError("This offer is already being used on another order. Please try again.", 409);
    }
    throw error;
  }
}

// Called the moment Payment.status first reaches PAID, from whichever
// payment method caused that (Part F: "Audit: PayFast, Bank Transfer,
// COD. Do not invent one state that breaks existing payment flows." —
// all three converge on this one Payment.status transition, so this is
// the single hook point every method's own transaction calls). Idempotent
// and safe to call on an order with no redemption row at all (most
// orders): updateMany affects zero rows silently.
export async function consumePreorderDiscountRedemption(tx: Tx, orderId: string): Promise<void> {
  await tx.preorderDiscountRedemption.updateMany({
    where: { orderId, status: PreorderDiscountRedemptionStatus.RESERVED },
    data: { status: PreorderDiscountRedemptionStatus.CONSUMED, consumedAt: new Date() },
  });
}

// Called when an order is cancelled (the only currently-reachable
// terminal state in this backend — see adminOrderStatus.service.ts's
// own comment on why OrderStatus.REFUNDED has no reachable code path
// today) while its redemption is still RESERVED or CONSUMED — Part F's
// "prefer releasing the benefit so the customer may use it on a later
// legitimate preorder" for a cancellation that happens either before
// payment (still RESERVED) or after payment but before fulfilment
// (already CONSUMED, e.g. a paid order cancelled before it ships).
// Idempotent: a no-op for an order with no redemption row, or one
// that's already RELEASED.
export async function releasePreorderDiscountRedemption(tx: Tx, orderId: string): Promise<void> {
  await tx.preorderDiscountRedemption.updateMany({
    where: { orderId, status: { in: ACTIVE_STATUSES } },
    data: { status: PreorderDiscountRedemptionStatus.RELEASED, releasedAt: new Date() },
  });
}
