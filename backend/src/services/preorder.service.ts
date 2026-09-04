// Milestone 181, Part B/C: pure, side-effect-free preorder status
// derivation and configuration validation. No database access here at
// all — every caller (order.service.ts, adminProduct.service.ts,
// product.service.ts) passes in an already-loaded Product row's own
// preorder fields and gets back a derived fact, never a stored one.
// This is the SINGLE place "is this product an active preorder right
// now" is decided — never trust a frontend-supplied preorder flag.

import { ProductStatus } from "@prisma/client";

export class PreorderConfigError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PreorderConfigError";
    this.statusCode = statusCode;
  }
}

export interface PreorderConfig {
  isPreorderEnabled: boolean;
  preorderStartAt: Date | null;
  preorderEndAt: Date | null;
  preorderReleaseAt: Date | null;
  isPreorderDiscountEligible: boolean;
}

// Part C: admin-facing status label, always calculated from
// configuration + current server time — never a manually-maintained
// field that could go stale (the brief's own explicit instruction).
export type PreorderAdminStatus = "NORMAL_SALE" | "PREORDER_SCHEDULED" | "PREORDER_ACTIVE" | "PREORDER_ENDED";

// The earliest of end/release that's actually set — either boundary
// stops the preorder (Part B's "AUTOMATIC END": "After preorderEndAt or
// preorderReleaseAt"). Null only when neither is set (never happens for
// preorderReleaseAt on a genuinely enabled preorder, since
// validatePreorderConfig requires it — this stays defensive for a row
// that predates validation or was written directly).
function effectiveEndBoundary(config: Pick<PreorderConfig, "preorderEndAt" | "preorderReleaseAt">): Date | null {
  const candidates = [config.preorderEndAt, config.preorderReleaseAt].filter((d): d is Date => d !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((earliest, current) => (current < earliest ? current : earliest));
}

export function derivePreorderAdminStatus(config: PreorderConfig, now: Date = new Date()): PreorderAdminStatus {
  if (!config.isPreorderEnabled) return "NORMAL_SALE";
  if (config.preorderStartAt && now < config.preorderStartAt) return "PREORDER_SCHEDULED";

  const endBoundary = effectiveEndBoundary(config);
  if (endBoundary && now >= endBoundary) return "PREORDER_ENDED";

  return "PREORDER_ACTIVE";
}

// Part B "PREORDER ACTIVE RULE": a product is an ACTIVE PREORDER only
// when the product itself is active/available under the existing
// Product rules AND isPreorderEnabled AND current server time is
// within the configured period AND release time has not already
// passed. `productStatus` is passed in rather than re-queried, so this
// stays a pure function — the caller (order.service.ts's verifyItems(),
// which already loads the full Product row) supplies it directly.
export function isActivePreorder(config: PreorderConfig, productStatus: ProductStatus, now: Date = new Date()): boolean {
  if (productStatus !== ProductStatus.ACTIVE) return false;
  if (!config.isPreorderEnabled) return false;
  if (config.preorderStartAt && now < config.preorderStartAt) return false;
  if (config.preorderEndAt && now >= config.preorderEndAt) return false;
  if (config.preorderReleaseAt && now >= config.preorderReleaseAt) return false;
  return true;
}

// Part B/H: this product's line qualifies for the first-registered-
// customer discount only when it is BOTH an active preorder right now
// AND explicitly marked discount-eligible by admin — the two flags are
// independent (Part C: "Eligible for First Preorder Discount" is its
// own checkbox, not implied by isPreorderEnabled alone).
export function isActivePreorderDiscountEligible(config: PreorderConfig, productStatus: ProductStatus, now: Date = new Date()): boolean {
  return isActivePreorder(config, productStatus, now) && config.isPreorderDiscountEligible;
}

const MIN_VALID_DATE = new Date("2020-01-01T00:00:00.000Z");
const MAX_VALID_DATE = new Date("2100-01-01T00:00:00.000Z");

function assertReasonableDate(value: Date, fieldName: string): void {
  if (Number.isNaN(value.getTime())) {
    throw new PreorderConfigError(`${fieldName} is not a valid date.`);
  }
  if (value < MIN_VALID_DATE || value > MAX_VALID_DATE) {
    throw new PreorderConfigError(`${fieldName} is not a reasonable date.`);
  }
}

// Part C "VALIDATION": rejects invalid configuration server-side —
// never relies on frontend validation alone. No constraints at all
// apply while isPreorderEnabled is false (an admin can freely clear
// dates on a disabled preorder without fighting stale validation).
export function validatePreorderConfig(config: PreorderConfig): void {
  if (!config.isPreorderEnabled) return;

  if (config.preorderStartAt) assertReasonableDate(config.preorderStartAt, "Preorder start date");
  if (config.preorderEndAt) assertReasonableDate(config.preorderEndAt, "Preorder end date");

  // Part B "RELEASE DATE": required when preorder is enabled.
  if (!config.preorderReleaseAt) {
    throw new PreorderConfigError("Release date is required when preorder is enabled.");
  }
  assertReasonableDate(config.preorderReleaseAt, "Release date");

  if (config.preorderStartAt && config.preorderEndAt && config.preorderEndAt <= config.preorderStartAt) {
    throw new PreorderConfigError("Preorder end date must be after the preorder start date.");
  }
  if (config.preorderStartAt && config.preorderReleaseAt <= config.preorderStartAt) {
    throw new PreorderConfigError("Release date must be after the preorder start date.");
  }
}
