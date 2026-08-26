// Version 7, Milestone 172B.5: the full eligibility rule matrix (§33 of
// the brief), exercised directly against the pure function — no
// database, no stubbing needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma, OrderStatus, PaymentStatus, OrderAffiliateCommissionStatus } from "@prisma/client";
import { computeApprovalEligibility, resolveFulfilmentEvent } from "./commissionEligibility.service.js";

const NOW = new Date("2026-03-01T00:00:00.000Z");
const DELIVERED_31_DAYS_AGO = new Date("2026-01-29T00:00:00.000Z"); // 31 days before NOW
const DELIVERED_29_DAYS_AGO = new Date("2026-01-31T00:00:00.000Z"); // 29 days before NOW
const PAID_31_DAYS_AGO = DELIVERED_31_DAYS_AGO;
const PAID_29_DAYS_AGO = DELIVERED_29_DAYS_AGO;

function baseParams(overrides: Partial<Parameters<typeof computeApprovalEligibility>[0]> = {}) {
  return {
    commissionStatus: OrderAffiliateCommissionStatus.PENDING,
    commissionAmount: new Prisma.Decimal("33.25"),
    orderStatus: OrderStatus.DELIVERED,
    paymentStatus: PaymentStatus.PAID,
    isDigitalOnly: false,
    paymentPaidAt: PAID_31_DAYS_AGO,
    deliveredStatusHistoryAt: DELIVERED_31_DAYS_AGO,
    commissionValidationDays: 30,
    now: NOW,
    ...overrides,
  };
}

test("unpaid order cannot approve", () => {
  const result = computeApprovalEligibility(baseParams({ paymentStatus: PaymentStatus.PENDING }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "PAYMENT_NOT_CONFIRMED");
});

test("paid but never fulfilled (no DELIVERED history, physical order) cannot approve", () => {
  const result = computeApprovalEligibility(baseParams({ deliveredStatusHistoryAt: null }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "NOT_FULFILLED");
});

test("fulfilled but validation period incomplete (29 of 30 days) cannot approve", () => {
  const result = computeApprovalEligibility(baseParams({ deliveredStatusHistoryAt: DELIVERED_29_DAYS_AGO }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "VALIDATION_PERIOD_INCOMPLETE");
  assert.ok(result.eligibleForApprovalAt && result.eligibleForApprovalAt > NOW);
});

test("eligible PENDING commission (paid, delivered 31 days ago, 30-day window) CAN approve", () => {
  const result = computeApprovalEligibility(baseParams());
  assert.equal(result.eligible, true);
  assert.equal(result.reason, null);
  assert.equal(result.fulfilmentBasis, "PHYSICAL_DELIVERED_STATUS_HISTORY");
});

test("exactly at the validation boundary (30 days, 30-day window) IS eligible — inclusive, not exclusive", () => {
  const exactlyThirtyDaysAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
  const result = computeApprovalEligibility(baseParams({ deliveredStatusHistoryAt: exactlyThirtyDaysAgo }));
  assert.equal(result.eligible, true);
});

test("one millisecond before the validation boundary is NOT yet eligible", () => {
  const almostThirtyDaysAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000 + 1);
  const result = computeApprovalEligibility(baseParams({ deliveredStatusHistoryAt: almostThirtyDaysAgo }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "VALIDATION_PERIOD_INCOMPLETE");
});

test("REVERSED commission cannot approve", () => {
  const result = computeApprovalEligibility(baseParams({ commissionStatus: OrderAffiliateCommissionStatus.REVERSED }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "ALREADY_REVERSED");
});

test("already-APPROVED commission cannot approve twice", () => {
  const result = computeApprovalEligibility(baseParams({ commissionStatus: OrderAffiliateCommissionStatus.APPROVED }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "ALREADY_APPROVED");
});

test("already-PAID commission cannot approve", () => {
  const result = computeApprovalEligibility(baseParams({ commissionStatus: OrderAffiliateCommissionStatus.PAID }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "ALREADY_PAID");
});

test("zero commission amount cannot approve, even if otherwise fully eligible", () => {
  const result = computeApprovalEligibility(baseParams({ commissionAmount: new Prisma.Decimal(0) }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "ZERO_COMMISSION_AMOUNT");
});

test("a cancelled order's commission cannot approve, even if payment/delivery/window all otherwise look satisfied", () => {
  const result = computeApprovalEligibility(baseParams({ orderStatus: OrderStatus.CANCELLED }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "ORDER_CANCELLED_OR_REFUNDED");
});

test("a refunded order's commission cannot approve", () => {
  const result = computeApprovalEligibility(baseParams({ orderStatus: OrderStatus.REFUNDED }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "ORDER_CANCELLED_OR_REFUNDED");
});

test("programme configuration is respected: a shorter validationDays (7) makes the same order eligible sooner", () => {
  const deliveredTenDaysAgo = new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000);
  const result = computeApprovalEligibility(baseParams({ deliveredStatusHistoryAt: deliveredTenDaysAgo, commissionValidationDays: 7 }));
  assert.equal(result.eligible, true);
});

test("programme configuration is respected: a longer validationDays (60) holds the same order back longer", () => {
  const result = computeApprovalEligibility(baseParams({ commissionValidationDays: 60 }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "VALIDATION_PERIOD_INCOMPLETE");
});

// ---------------------------------------------------------------------------
// Fulfilment basis: digital-only vs physical/mixed.
// ---------------------------------------------------------------------------

test("digital-only order uses Payment.paidAt as the fulfilment event, not delivery history", () => {
  const event = resolveFulfilmentEvent({ isDigitalOnly: true, paymentPaidAt: PAID_31_DAYS_AGO, deliveredStatusHistoryAt: null });
  assert.equal(event.fulfilledAt?.getTime(), PAID_31_DAYS_AGO.getTime());
  assert.equal(event.basis, "DIGITAL_PAYMENT_CONFIRMED");
});

test("digital-only order with no paidAt (shouldn't normally happen alongside PaymentStatus.PAID) has no fulfilment event", () => {
  const event = resolveFulfilmentEvent({ isDigitalOnly: true, paymentPaidAt: null, deliveredStatusHistoryAt: DELIVERED_31_DAYS_AGO });
  assert.equal(event.fulfilledAt, null);
});

test("a digital-only order becomes eligible from payment confirmation alone, with no delivery history at all", () => {
  const result = computeApprovalEligibility(baseParams({ isDigitalOnly: true, deliveredStatusHistoryAt: null, paymentPaidAt: PAID_31_DAYS_AGO }));
  assert.equal(result.eligible, true);
  assert.equal(result.fulfilmentBasis, "DIGITAL_PAYMENT_CONFIRMED");
});

test("a MIXED order (physical + digital) is treated as physical — payment alone is not enough, delivery history is required", () => {
  const result = computeApprovalEligibility(baseParams({ isDigitalOnly: false, deliveredStatusHistoryAt: null, paymentPaidAt: PAID_31_DAYS_AGO }));
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "NOT_FULFILLED");
});
