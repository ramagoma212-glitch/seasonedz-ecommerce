// Version 7, Milestone 172B.5: pure, side-effect-free eligibility
// computation for the commission lifecycle (PENDING -> APPROVED). No
// database access here — every input is passed in already-loaded, so
// this is directly unit-testable with synthetic data, same "pure
// function, no module reload needed" discipline as env.ts's
// resolveOAuthCallbackBaseUrl()/resolveReferralAttributionSecret().
//
// ---------------------------------------------------------------------------
// Fulfilment/delivery timestamp basis — audited, not guessed.
// ---------------------------------------------------------------------------
// This backend has THREE separate, independently-writable signals that
// could plausibly mean "delivered":
//   1. Shipping.deliveredAt — a real timestamp column, but only ever set
//      when an admin manually types a date into the shipping-update form
//      (adminShipping.service.ts). It can stay null even on a genuinely
//      delivered order if the admin only changed the status dropdown.
//   2. Order.updatedAt — auto-touched by Prisma on ANY write to the row,
//      including unrelated ones (PayFast ITN, digital-download token
//      issuance, etc.), so it does not reliably mean "became delivered
//      at this instant".
//   3. OrderStatusHistory — an append-only, purpose-built audit log
//      created by adminOrderStatus.service.ts's updateOrderStatus() the
//      moment Order.status genuinely transitions, with a createdAt this
//      milestone's own reversal hook also relies on. Never touched by
//      any other write in this codebase.
//
// (3) is the only one of the three that is both reliable AND already
// exists — no new field, no migration. This module uses the createdAt
// of the most recent OrderStatusHistory row where newStatus = DELIVERED
// as the "genuinely delivered" timestamp for every order carrying a
// physical item (courier or Customer Collection alike — there is no
// separate "collected" status anywhere in this schema, so DELIVERED is
// the safest existing proxy for both, exactly as instructed: "use the
// safest existing timestamp/status and clearly document the
// limitation").
//
// A DIGITAL-only order has nothing to physically deliver at all — its
// fulfilment-equivalent moment is payment confirmation itself
// (Payment.paidAt), matching how payfast.service.ts's own COMPLETE
// branch already treats "paid" as the point a digital order's download
// access is granted.
//
// A MIXED order (both physical and digital items) is treated the same
// as a physical order — its commission must wait for genuine delivery
// of the physical component, never becoming eligible merely because the
// digital half was paid for.
import { Prisma, OrderStatus, PaymentStatus, OrderAffiliateCommissionStatus } from "@prisma/client";

export type FulfilmentBasis = "PHYSICAL_DELIVERED_STATUS_HISTORY" | "DIGITAL_PAYMENT_CONFIRMED";

export interface FulfilmentEvent {
  fulfilledAt: Date | null;
  basis: FulfilmentBasis | null;
}

export function resolveFulfilmentEvent(params: {
  isDigitalOnly: boolean;
  paymentPaidAt: Date | null;
  deliveredStatusHistoryAt: Date | null;
}): FulfilmentEvent {
  if (params.isDigitalOnly) {
    return params.paymentPaidAt ? { fulfilledAt: params.paymentPaidAt, basis: "DIGITAL_PAYMENT_CONFIRMED" } : { fulfilledAt: null, basis: null };
  }
  return params.deliveredStatusHistoryAt ? { fulfilledAt: params.deliveredStatusHistoryAt, basis: "PHYSICAL_DELIVERED_STATUS_HISTORY" } : { fulfilledAt: null, basis: null };
}

// One reason at a time — the FIRST one that applies, checked in a fixed
// order (cheapest / most fundamental first). Never combined, matching
// this backend's existing "one clear reason" error-message convention.
export type EligibilityReason =
  | "ALREADY_REVERSED"
  | "ALREADY_PAID"
  | "ALREADY_APPROVED"
  | "ORDER_CANCELLED_OR_REFUNDED"
  | "ZERO_COMMISSION_AMOUNT"
  | "PAYMENT_NOT_CONFIRMED"
  | "NOT_FULFILLED"
  | "VALIDATION_PERIOD_INCOMPLETE";

export const ELIGIBILITY_REASON_LABELS: Record<EligibilityReason, string> = {
  ALREADY_REVERSED: "This commission has already been reversed.",
  ALREADY_PAID: "This commission has already been paid.",
  ALREADY_APPROVED: "This commission has already been approved.",
  ORDER_CANCELLED_OR_REFUNDED: "The order has been cancelled or refunded.",
  ZERO_COMMISSION_AMOUNT: "The commission amount is zero.",
  PAYMENT_NOT_CONFIRMED: "The order has not been paid yet.",
  NOT_FULFILLED: "The order has not been delivered/fulfilled yet.",
  VALIDATION_PERIOD_INCOMPLETE: "The programme's validation period has not elapsed yet.",
};

export interface EligibilityResult {
  eligible: boolean;
  reason: EligibilityReason | null;
  eligibleForApprovalAt: Date | null;
  fulfilmentBasis: FulfilmentBasis | null;
}

// The one place approval eligibility is decided — called both by the
// real approve action (referralCommission.service.ts) and by the
// read-only commission list/detail views (so an admin sees the exact
// same "why not yet" reason the approve button itself would enforce,
// never a client-side guess). commissionValidationDays is always the
// PROGRAMME'S CURRENT value (AffiliateProgrammeSettings), read fresh at
// the moment of the check — this milestone deliberately does not
// snapshot it onto the commission row (see this milestone's own final
// report for why: an already-PENDING commission benefits from a later
// SHORTENING of the validation period the same way it would be held
// back by a later lengthening — both are the owner's current policy
// applied prospectively, never a retroactive change to money already
// calculated, since discountAmount/commissionAmount themselves are
// still the permanent snapshot from order-creation time).
export function computeApprovalEligibility(params: {
  commissionStatus: OrderAffiliateCommissionStatus;
  commissionAmount: Prisma.Decimal;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  isDigitalOnly: boolean;
  paymentPaidAt: Date | null;
  deliveredStatusHistoryAt: Date | null;
  commissionValidationDays: number;
  now?: Date;
}): EligibilityResult {
  const now = params.now ?? new Date();

  if (params.commissionStatus === OrderAffiliateCommissionStatus.REVERSED) {
    return { eligible: false, reason: "ALREADY_REVERSED", eligibleForApprovalAt: null, fulfilmentBasis: null };
  }
  if (params.commissionStatus === OrderAffiliateCommissionStatus.PAID) {
    return { eligible: false, reason: "ALREADY_PAID", eligibleForApprovalAt: null, fulfilmentBasis: null };
  }
  if (params.commissionStatus === OrderAffiliateCommissionStatus.APPROVED) {
    return { eligible: false, reason: "ALREADY_APPROVED", eligibleForApprovalAt: null, fulfilmentBasis: null };
  }

  if (params.orderStatus === OrderStatus.CANCELLED || params.orderStatus === OrderStatus.REFUNDED) {
    return { eligible: false, reason: "ORDER_CANCELLED_OR_REFUNDED", eligibleForApprovalAt: null, fulfilmentBasis: null };
  }

  if (params.commissionAmount.lte(0)) {
    return { eligible: false, reason: "ZERO_COMMISSION_AMOUNT", eligibleForApprovalAt: null, fulfilmentBasis: null };
  }

  if (params.paymentStatus !== PaymentStatus.PAID) {
    return { eligible: false, reason: "PAYMENT_NOT_CONFIRMED", eligibleForApprovalAt: null, fulfilmentBasis: null };
  }

  const fulfilment = resolveFulfilmentEvent({
    isDigitalOnly: params.isDigitalOnly,
    paymentPaidAt: params.paymentPaidAt,
    deliveredStatusHistoryAt: params.deliveredStatusHistoryAt,
  });

  if (!fulfilment.fulfilledAt) {
    return { eligible: false, reason: "NOT_FULFILLED", eligibleForApprovalAt: null, fulfilmentBasis: null };
  }

  const eligibleForApprovalAt = new Date(fulfilment.fulfilledAt.getTime() + params.commissionValidationDays * 24 * 60 * 60 * 1000);

  if (now < eligibleForApprovalAt) {
    return { eligible: false, reason: "VALIDATION_PERIOD_INCOMPLETE", eligibleForApprovalAt, fulfilmentBasis: fulfilment.basis };
  }

  return { eligible: true, reason: null, eligibleForApprovalAt, fulfilmentBasis: fulfilment.basis };
}
