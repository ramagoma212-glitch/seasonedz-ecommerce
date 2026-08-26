// Version 7, Milestone 172B.4: pure, side-effect-free referral discount/
// commission math. The one place this rate-resolution and rounding
// logic is written — order.service.ts (the real, binding calculation at
// order-creation time) and referralCapture.service.ts (the non-binding
// checkout preview) both call this rather than each re-implementing it,
// so the two can never quietly drift apart.
//
// Rounding: round-half-up to 2 decimal places, matching ordinary retail
// rounding and the approved V1 worked example — R500 qualifying, 5% ->
// R25.00 exactly; R475 net, 7% -> R33.25 exactly (see
// OrderAffiliateCommission's own schema comment for this example).

import { Prisma } from "@prisma/client";

export function roundHalfUpToCents(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export interface ReferralRateSource {
  discountRateOverride: Prisma.Decimal | null;
  commissionRateOverride: Prisma.Decimal | null;
}

export interface ReferralProgrammeRates {
  defaultReferralDiscountRate: Prisma.Decimal;
  defaultCommissionRate: Prisma.Decimal;
}

// Null override means "use the programme's current default" — never
// copied in at any earlier point, so a later programme-wide rate change
// still applies to every affiliate with no override of their own (see
// Affiliate's own schema comment).
export function resolveDiscountRate(affiliate: ReferralRateSource, settings: ReferralProgrammeRates): Prisma.Decimal {
  return affiliate.discountRateOverride ?? settings.defaultReferralDiscountRate;
}

export function resolveCommissionRate(affiliate: ReferralRateSource, settings: ReferralProgrammeRates): Prisma.Decimal {
  return affiliate.commissionRateOverride ?? settings.defaultCommissionRate;
}

export interface ReferralPricingResult {
  discountRateApplied: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  netQualifyingAmount: Prisma.Decimal;
  commissionRateApplied: Prisma.Decimal;
  commissionAmount: Prisma.Decimal;
}

// qualifyingProductSubtotal must exclude gift wrap and delivery — the
// approved V1 rule, and callers (order.service.ts) pass the exact same
// value already used as the order's own `subtotal`, since V1 has no
// product-level referral exclusion.
//
// isSelfReferral never changes the discount (the affiliate keeps their
// own customer discount on a self-purchase — the approved V1 rule) but
// always zeroes the commission. It stays a parameter of the pure
// calculation (rather than only a branch the caller adds afterward) so
// there is exactly one place "self-referral means zero commission" is
// decided, not two that could disagree.
export function calculateReferralPricing(
  qualifyingProductSubtotal: Prisma.Decimal,
  affiliate: ReferralRateSource,
  settings: ReferralProgrammeRates,
  isSelfReferral: boolean
): ReferralPricingResult {
  const discountRateApplied = resolveDiscountRate(affiliate, settings);
  const discountAmount = roundHalfUpToCents(qualifyingProductSubtotal.times(discountRateApplied).dividedBy(100));
  const netQualifyingAmount = qualifyingProductSubtotal.minus(discountAmount);
  const commissionRateApplied = resolveCommissionRate(affiliate, settings);
  const commissionAmount = isSelfReferral ? new Prisma.Decimal(0) : roundHalfUpToCents(netQualifyingAmount.times(commissionRateApplied).dividedBy(100));

  return { discountRateApplied, discountAmount, netQualifyingAmount, commissionRateApplied, commissionAmount };
}
