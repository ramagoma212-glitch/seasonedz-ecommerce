// Version 7, Milestone 172B.4: the approved V1 worked example (see
// OrderAffiliateCommission's own schema comment) plus the rounding/
// override/self-referral rules that example implies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { calculateReferralPricing, roundHalfUpToCents } from "./referralPricing.service.js";

const PROGRAMME_DEFAULTS = {
  defaultReferralDiscountRate: new Prisma.Decimal("5.00"),
  defaultCommissionRate: new Prisma.Decimal("7.00"),
};

test("the approved worked example: R500 qualifying, 5% discount -> R25.00, R475 net, 7% -> R33.25 commission", () => {
  const result = calculateReferralPricing(
    new Prisma.Decimal("500.00"),
    { discountRateOverride: null, commissionRateOverride: null },
    PROGRAMME_DEFAULTS,
    false
  );
  assert.equal(result.discountAmount.toString(), "25");
  assert.equal(result.netQualifyingAmount.toString(), "475");
  assert.equal(result.commissionAmount.toString(), "33.25");
});

test("an affiliate's own rate overrides win over the programme default", () => {
  const result = calculateReferralPricing(
    new Prisma.Decimal("500.00"),
    { discountRateOverride: new Prisma.Decimal("10.00"), commissionRateOverride: new Prisma.Decimal("15.00") },
    PROGRAMME_DEFAULTS,
    false
  );
  assert.equal(result.discountRateApplied.toString(), "10");
  assert.equal(result.discountAmount.toString(), "50");
  assert.equal(result.commissionRateApplied.toString(), "15");
});

test("self-referral: commission is always zero regardless of rate, but the discount is unaffected", () => {
  const result = calculateReferralPricing(
    new Prisma.Decimal("500.00"),
    { discountRateOverride: null, commissionRateOverride: new Prisma.Decimal("20.00") },
    PROGRAMME_DEFAULTS,
    true
  );
  assert.equal(result.discountAmount.toString(), "25");
  assert.equal(result.commissionAmount.toString(), "0");
});

test("a zero-rate default produces a zero discount and zero commission, never an error", () => {
  const result = calculateReferralPricing(
    new Prisma.Decimal("500.00"),
    { discountRateOverride: null, commissionRateOverride: null },
    { defaultReferralDiscountRate: new Prisma.Decimal("0"), defaultCommissionRate: new Prisma.Decimal("0") },
    false
  );
  assert.equal(result.discountAmount.toString(), "0");
  assert.equal(result.commissionAmount.toString(), "0");
});

test("round-half-up to the cent: a subtotal that produces a fractional-cent result rounds up at exactly .5", () => {
  // R10.03 at 5% = R0.5015 -> rounds to R0.50 (down, since the third
  // decimal is 1, not a genuine .5 case) — this case instead forces a
  // real half-cent: R33.33 at 5% = R1.6665 -> rounds up to R1.67.
  assert.equal(roundHalfUpToCents(new Prisma.Decimal("1.665")).toString(), "1.67");
  assert.equal(roundHalfUpToCents(new Prisma.Decimal("1.664")).toString(), "1.66");
});
