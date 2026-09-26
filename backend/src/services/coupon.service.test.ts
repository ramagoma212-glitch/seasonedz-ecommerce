// Milestone 197, Part 17 (MONEY/VALIDATION/STACKING coverage): dedicated
// tests for coupon.service.ts's validation and discount-math logic — the
// money-critical part of this milestone. Same stub() helper pattern
// order.service.test.ts already establishes for mocking individual
// Prisma model delegates in isolation, without a real database.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { previewCoupon, resolveCouponForOrder, createCoupon, updateCoupon, CouponError } from "./coupon.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function baseCouponRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "coupon-1",
    code: "WELCOME10",
    description: null,
    isActive: true,
    discountType: "PERCENTAGE",
    discountValue: new Prisma.Decimal(10),
    minimumOrderSubtotal: null,
    maximumDiscountAmount: null,
    startsAt: null,
    expiresAt: null,
    maxTotalUses: null,
    maxUsesPerCustomer: null,
    timesRedeemed: 0,
    customerEligibility: "ALL",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function stubEmptyRestrictions() {
  return [
    stub(prisma.couponProduct, "findMany", async () => []),
    stub(prisma.couponCategory, "findMany", async () => []),
    stub(prisma.couponExcludedProduct, "findMany", async () => []),
  ];
}

test("valid percentage coupon calculates 10% correctly (R100 -> R10)", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow());
  const restrictions = stubEmptyRestrictions();

  const result = await previewCoupon("welcome10", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);

  assert.equal(result.valid, true);
  assert.equal(result.discountAmount.toFixed(2), "10.00");

  findUnique.restore();
  restrictions.forEach((r) => r.restore());
});

test("coupon code is case-insensitive: welcome10/WELCOME10/Welcome10 all resolve the same row", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async (args: { where: { code: string } }) => {
    assert.equal(args.where.code, "WELCOME10");
    return baseCouponRow();
  });
  const restrictions = stubEmptyRestrictions();

  for (const raw of ["welcome10", "WELCOME10", "Welcome10", "  welcome10  "]) {
    const result = await previewCoupon(raw, null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);
    assert.equal(result.valid, true);
  }

  findUnique.restore();
  restrictions.forEach((r) => r.restore());
});

test("rounding: R199.99 x 10% rounds half-up to R20.00", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow());
  const restrictions = stubEmptyRestrictions();

  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(199.99) }]);
  assert.equal(result.discountAmount.toFixed(2), "20.00");

  findUnique.restore();
  restrictions.forEach((r) => r.restore());
});

test("rounding: R649.99 x 10% = R65.00 (half-up)", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow());
  const restrictions = stubEmptyRestrictions();

  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(649.99) }]);
  assert.equal(result.discountAmount.toFixed(2), "65.00");

  findUnique.restore();
  restrictions.forEach((r) => r.restore());
});

test("percentage coupon respects a maximum discount cap", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ discountValue: new Prisma.Decimal(50), maximumDiscountAmount: new Prisma.Decimal(100) }));
  const restrictions = stubEmptyRestrictions();

  // R1000 x 50% = R500, but capped at R100.
  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(1000) }]);
  assert.equal(result.discountAmount.toFixed(2), "100.00");

  findUnique.restore();
  restrictions.forEach((r) => r.restore());
});

test("fixed-amount coupon never discounts below zero: R50 coupon on R30 eligible subtotal discounts only R30", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ discountType: "FIXED_AMOUNT", discountValue: new Prisma.Decimal(50) }));
  const restrictions = stubEmptyRestrictions();

  const result = await previewCoupon("SAVE50", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(30) }]);
  assert.equal(result.valid, true);
  assert.equal(result.discountAmount.toFixed(2), "30.00");

  findUnique.restore();
  restrictions.forEach((r) => r.restore());
});

test("unknown coupon code is rejected with a specific message", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => null);
  const result = await previewCoupon("NOTREAL", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, false);
  assert.equal(result.message, "Coupon code not found.");
  findUnique.restore();
});

test("inactive coupon is rejected", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ isActive: false }));
  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, false);
  assert.match(result.message, /no longer available/);
  findUnique.restore();
});

test("scheduled coupon (not yet started) is rejected before its start date", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ startsAt: new Date("2099-01-01T00:00:00Z") }));
  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, false);
  assert.equal(result.message, "This coupon is not active yet.");
  findUnique.restore();
});

test("expired coupon is rejected", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ expiresAt: new Date("2020-01-01T00:00:00Z") }));
  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, false);
  assert.equal(result.message, "This coupon has expired.");
  findUnique.restore();
});

test("logged-in-only coupon is rejected for a guest", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ customerEligibility: "LOGGED_IN_ONLY" }));
  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, false);
  assert.equal(result.message, "Sign in to use this coupon.");
  findUnique.restore();
});

test("logged-in-only coupon is accepted for a registered customer", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ customerEligibility: "LOGGED_IN_ONLY" }));
  const restrictions = stubEmptyRestrictions();
  const result = await previewCoupon("WELCOME10", "customer-1", "a@example.com", [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, true);
  findUnique.restore();
  restrictions.forEach((r) => r.restore());
});

test("minimum order subtotal is enforced", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ minimumOrderSubtotal: new Prisma.Decimal(200) }));
  const restrictions = stubEmptyRestrictions();
  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(150) }]);
  assert.equal(result.valid, false);
  assert.match(result.message, /R200\.00 minimum/);
  findUnique.restore();
  restrictions.forEach((r) => r.restore());
});

test("minimum order subtotal is judged only against the coupon-eligible subtotal, not the whole cart", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ minimumOrderSubtotal: new Prisma.Decimal(200), discountValue: new Prisma.Decimal(10) }));
  const productFindMany = stub(prisma.product, "findMany", async () => [{ id: "eligible", categoryId: "cat-1" }]);
  const couponProduct = stub(prisma.couponProduct, "findMany", async () => [{ productId: "eligible" }]);
  const couponCategory = stub(prisma.couponCategory, "findMany", async () => []);
  const couponExcluded = stub(prisma.couponExcludedProduct, "findMany", async () => []);

  // Only "eligible" (R150) counts toward the R200 minimum — "other"
  // (R100) is outside the coupon's product restriction entirely.
  const result = await previewCoupon("WELCOME10", null, null, [
    { productId: "eligible", lineTotal: new Prisma.Decimal(150) },
    { productId: "other", lineTotal: new Prisma.Decimal(100) },
  ]);
  assert.equal(result.valid, false);

  findUnique.restore();
  productFindMany.restore();
  couponProduct.restore();
  couponCategory.restore();
  couponExcluded.restore();
});

test("usage limit (total) is enforced", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ maxTotalUses: 5, timesRedeemed: 5 }));
  const restrictions = stubEmptyRestrictions();
  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, false);
  assert.match(result.message, /usage limit/);
  findUnique.restore();
  restrictions.forEach((r) => r.restore());
});

test("per-customer usage limit is enforced", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow({ maxUsesPerCustomer: 1 }));
  const restrictions = stubEmptyRestrictions();
  const redemptionCount = stub(prisma.couponRedemption, "count", async () => 1);

  const result = await previewCoupon("WELCOME10", "customer-1", "a@example.com", [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, false);
  assert.match(result.message, /usage limit/);

  findUnique.restore();
  restrictions.forEach((r) => r.restore());
  redemptionCount.restore();
});

test("product restriction: a product not in the coupon's include list is not eligible", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow());
  const couponProduct = stub(prisma.couponProduct, "findMany", async () => [{ productId: "included-product" }]);
  const couponCategory = stub(prisma.couponCategory, "findMany", async () => []);
  const couponExcluded = stub(prisma.couponExcludedProduct, "findMany", async () => []);
  const productFindMany = stub(prisma.product, "findMany", async () => [{ id: "other-product", categoryId: "cat-1" }]);

  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "other-product", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, false);
  assert.match(result.message, /not valid for the products/);

  findUnique.restore();
  couponProduct.restore();
  couponCategory.restore();
  couponExcluded.restore();
  productFindMany.restore();
});

test("category restriction: a product in the coupon's included category is eligible", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow());
  const couponProduct = stub(prisma.couponProduct, "findMany", async () => []);
  const couponCategory = stub(prisma.couponCategory, "findMany", async () => [{ categoryId: "bundles-cat" }]);
  const couponExcluded = stub(prisma.couponExcludedProduct, "findMany", async () => []);
  const productFindMany = stub(prisma.product, "findMany", async () => [{ id: "bundle-product", categoryId: "bundles-cat" }]);

  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "bundle-product", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, true);
  assert.equal(result.discountAmount.toFixed(2), "10.00");

  findUnique.restore();
  couponProduct.restore();
  couponCategory.restore();
  couponExcluded.restore();
  productFindMany.restore();
});

test("excluded product is always removed, even if it would otherwise be eligible", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow());
  const couponProduct = stub(prisma.couponProduct, "findMany", async () => []);
  const couponCategory = stub(prisma.couponCategory, "findMany", async () => []);
  const couponExcluded = stub(prisma.couponExcludedProduct, "findMany", async () => [{ productId: "excluded-product" }]);

  const result = await previewCoupon("WELCOME10", null, null, [{ productId: "excluded-product", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, false);

  findUnique.restore();
  couponProduct.restore();
  couponCategory.restore();
  couponExcluded.restore();
});

test("resolveCouponForOrder (the authoritative order-creation path) uses the exact same logic as previewCoupon", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => baseCouponRow());
  const restrictions = stubEmptyRestrictions();

  const result = await resolveCouponForOrder("WELCOME10", null, "guest@example.com", [{ productId: "p1", lineTotal: new Prisma.Decimal(100) }]);
  assert.equal(result.valid, true);
  assert.equal(result.discountAmount.toFixed(2), "10.00");

  findUnique.restore();
  restrictions.forEach((r) => r.restore());
});

// --- ADMIN VALIDATION ---

test("admin: percentage discount value must be between 1 and 100", async () => {
  await assert.rejects(
    () => createCoupon({ code: "BAD", discountType: "PERCENTAGE", discountValue: 150 }),
    (error: unknown) => error instanceof CouponError && /between 1 and 100/.test(error.message)
  );
  await assert.rejects(
    () => createCoupon({ code: "BAD2", discountType: "PERCENTAGE", discountValue: 0 }),
    (error: unknown) => error instanceof CouponError && /between 1 and 100/.test(error.message)
  );
});

test("admin: fixed amount discount value must be greater than 0", async () => {
  await assert.rejects(
    () => createCoupon({ code: "BAD3", discountType: "FIXED_AMOUNT", discountValue: -10 }),
    (error: unknown) => error instanceof CouponError && /greater than 0/.test(error.message)
  );
});

test("admin: expiry date must be after start date", async () => {
  await assert.rejects(
    () =>
      createCoupon({
        code: "BADDATES",
        discountType: "PERCENTAGE",
        discountValue: 10,
        startsAt: "2026-06-01T00:00:00Z",
        expiresAt: "2026-01-01T00:00:00Z",
      }),
    (error: unknown) => error instanceof CouponError && /after the start date/.test(error.message)
  );
});

test("admin: coupon code must be well-formed (letters/numbers/hyphen/underscore, 3-32 chars)", async () => {
  await assert.rejects(
    () => createCoupon({ code: "a!", discountType: "PERCENTAGE", discountValue: 10 }),
    (error: unknown) => error instanceof CouponError
  );
});

test("admin: updateCoupon rejects a not-found coupon", async () => {
  const findUnique = stub(prisma.coupon, "findUnique", async () => null);
  await assert.rejects(
    () => updateCoupon("does-not-exist", { isActive: false }),
    (error: unknown) => error instanceof CouponError && error.statusCode === 404
  );
  findUnique.restore();
});
