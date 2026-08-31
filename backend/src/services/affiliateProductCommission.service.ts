// Milestone 178, Part C: pure, side-effect-free per-product commission
// math — the same "one place this is written" discipline
// referralPricing.service.ts already established for the whole-order
// discount/commission calculation. order.service.ts's own commission-
// creation step calls this to build the itemised
// OrderAffiliateProductCommission rows behind a referred order's
// OrderAffiliateCommission.commissionAmount.
//
// The customer-facing referral DISCOUNT (rate and amount) is computed
// exactly as before, on the whole order's subtotal, by
// referralPricing.service.ts — this file never changes that. What
// changes is only which portion of the order counts toward the
// AFFILIATE'S commission, and at what rate: only lines whose product
// has an affiliate-eligible AffiliateProductSetting count at all, and
// each such line uses its OWN configured rate/amount (falling back to
// the affiliate's normal resolved rate when a PERCENTAGE line has no
// override — see resolveCommissionRate() in referralPricing.service.ts).
//
// PERCENTAGE: the line's own subtotal (unitPrice * quantity, before the
// referral discount) has the SAME discount rate already applied to the
// whole order subtracted from it first (this is mathematically
// identical to prorating the order-level discount by each line's share
// of the subtotal, since the discount is a single flat percentage), then
// the resolved percentage is applied to that net amount — the "after
// the customer referral discount, excluding delivery/gift wrap"
// qualifying-amount logic the brief asks to keep. FIXED_AMOUNT: a flat
// per-unit amount multiplied by quantity, with no discount/qualifying-
// amount involvement at all — a flat amount is not a percentage of
// anything.
//
// Every AffiliateProductSetting field consulted here is passed in as an
// already-loaded snapshot (never queried live inside this function) —
// this file has no database access at all, matching
// referralPricing.service.ts's own "pure" discipline, and every
// resulting figure is meant to be persisted immediately as an immutable
// OrderAffiliateProductCommission row, never recomputed from a later
// read of AffiliateProductSetting or Product.price.

import { Prisma } from "@prisma/client";
import { roundHalfUpToCents } from "./referralPricing.service.js";

export type AffiliateProductCommissionTypeValue = "PERCENTAGE" | "FIXED_AMOUNT";

export interface AffiliateProductSettingSnapshot {
  commissionType: AffiliateProductCommissionTypeValue;
  commissionPercent: Prisma.Decimal | null;
  fixedCommissionAmount: Prisma.Decimal | null;
  maximumCommission: Prisma.Decimal | null;
  isAffiliateAvailable: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}

export interface OrderItemForCommission {
  orderItemId: string;
  productId: string | null;
  quantity: number;
  // unitPrice * quantity, pre-discount — the same figure OrderItem.lineTotal
  // already stores.
  lineTotal: Prisma.Decimal;
}

export interface ProductLineCommissionResult {
  orderItemId: string;
  productId: string;
  commissionType: AffiliateProductCommissionTypeValue;
  commissionPercent: Prisma.Decimal | null;
  fixedCommissionAmount: Prisma.Decimal | null;
  eligibleProductSubtotal: Prisma.Decimal;
  quantity: number;
  maximumCommission: Prisma.Decimal | null;
  calculatedCommission: Prisma.Decimal;
}

export interface ProductCommissionCalculationResult {
  lines: ProductLineCommissionResult[];
  totalCommission: Prisma.Decimal;
  totalEligibleSubtotal: Prisma.Decimal;
}

// Whether `at` falls within an optional [startsAt, endsAt] window —
// either bound absent means "no restriction on that side".
function withinWindow(at: Date, startsAt: Date | null, endsAt: Date | null): boolean {
  if (startsAt && at < startsAt) return false;
  if (endsAt && at > endsAt) return false;
  return true;
}

// fallbackCommissionPercent is the affiliate's own ALREADY-RESOLVED rate
// (their commissionRateOverride, or else the programme default) — the
// exact same figure the whole-order calculateReferralPricing() call
// already produced as commissionRateApplied. Passed in pre-resolved
// rather than re-derived here, so there is exactly one place
// (referralPricing.service.ts's resolveCommissionRate()) that ever
// decides what an affiliate's "own rate" is.
export function calculateProductCommissions(
  items: OrderItemForCommission[],
  settingsByProductId: Map<string, AffiliateProductSettingSnapshot>,
  fallbackCommissionPercent: Prisma.Decimal,
  discountRateApplied: Prisma.Decimal,
  orderCreatedAt: Date
): ProductCommissionCalculationResult {
  const lines: ProductLineCommissionResult[] = [];

  for (const item of items) {
    if (!item.productId) continue;
    const setting = settingsByProductId.get(item.productId);
    if (!setting) continue;
    if (!setting.isAffiliateAvailable) continue;
    if (!withinWindow(orderCreatedAt, setting.startsAt, setting.endsAt)) continue;

    let commissionPercent: Prisma.Decimal | null = null;
    let fixedCommissionAmount: Prisma.Decimal | null = null;
    let calculated: Prisma.Decimal;

    if (setting.commissionType === "FIXED_AMOUNT") {
      fixedCommissionAmount = setting.fixedCommissionAmount ?? new Prisma.Decimal(0);
      calculated = roundHalfUpToCents(fixedCommissionAmount.times(item.quantity));
    } else {
      const netLineAmount = roundHalfUpToCents(item.lineTotal.times(new Prisma.Decimal(100).minus(discountRateApplied)).dividedBy(100));
      commissionPercent = setting.commissionPercent ?? fallbackCommissionPercent;
      calculated = roundHalfUpToCents(netLineAmount.times(commissionPercent).dividedBy(100));
    }

    if (setting.maximumCommission !== null && calculated.gt(setting.maximumCommission)) {
      calculated = setting.maximumCommission;
    }

    lines.push({
      orderItemId: item.orderItemId,
      productId: item.productId,
      commissionType: setting.commissionType,
      commissionPercent,
      fixedCommissionAmount,
      eligibleProductSubtotal: item.lineTotal,
      quantity: item.quantity,
      maximumCommission: setting.maximumCommission,
      calculatedCommission: calculated,
    });
  }

  const totalCommission = lines.reduce((sum, line) => sum.plus(line.calculatedCommission), new Prisma.Decimal(0));
  const totalEligibleSubtotal = lines.reduce((sum, line) => sum.plus(line.eligibleProductSubtotal), new Prisma.Decimal(0));

  return { lines, totalCommission, totalEligibleSubtotal };
}
