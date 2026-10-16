// Milestone 197.1C: regression coverage for a real production bug this
// milestone found and fixed — previewCouponHandler's own resolveEligibleLines()
// used to key items by a raw `productId`, but the frontend's cart model
// (src/js/api/mappers.js's mapApiProductToFrontendShape) has never actually
// had the database's real id to send — it deliberately uses the product
// SLUG as its internal id, a carry-over from this site's pre-backend static
// data. Every real "Apply Coupon" click therefore silently failed to match
// any product, zeroing eligibleSubtotal and showing "This coupon is not
// valid for the products in your cart" for every coupon, on every order,
// since Milestone 197 shipped — completely undetected, because
// coupon.service.test.ts tests resolve() directly with hand-built
// CouponEligibleLine[] (bypassing this exact translation step), and every
// Playwright coupon test mocks **/api/coupons/preview outright. This file
// is the one place that exercises the real req.body -> eligible-lines
// translation at all.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { previewCouponHandler } from "./coupon.controller.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function fakeRes() {
  const res: { statusCode?: number; body?: unknown } & Partial<Response> = {};
  res.status = mock.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response["status"];
  res.json = mock.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as unknown as Response["json"];
  return res;
}

function fakeReq(body: Record<string, unknown>) {
  return { body, customerUser: undefined } as unknown as Request;
}

function stubCoupon(overrides: Record<string, unknown> = {}) {
  const row = {
    id: "coupon-1",
    code: "TESTZERO01",
    isActive: true,
    discountType: "PERCENTAGE",
    discountValue: new Prisma.Decimal(100),
    minimumOrderSubtotal: null,
    maximumOrderSubtotal: new Prisma.Decimal(250),
    maximumDiscountAmount: null,
    startsAt: null,
    expiresAt: null,
    maxTotalUses: null,
    maxUsesPerCustomer: null,
    timesRedeemed: 0,
    customerEligibility: "ALL",
    freeDelivery: true,
    ...overrides,
  };
  const findUnique = stub(prisma.coupon, "findUnique", async () => row);
  const couponProduct = stub(prisma.couponProduct, "findMany", async () => []);
  const couponCategory = stub(prisma.couponCategory, "findMany", async () => []);
  const couponExcluded = stub(prisma.couponExcludedProduct, "findMany", async () => []);
  return {
    restore: () => {
      findUnique.restore();
      couponProduct.restore();
      couponCategory.restore();
      couponExcluded.restore();
    },
  };
}

test("REGRESSION: the real frontend request shape (productSlug, never productId) resolves a correct discount — this is exactly what broke in production", async () => {
  const coupon = stubCoupon();
  const productFindUnique = stub(prisma.product, "findUnique", async (args: { where: { slug?: string } }) => {
    assert.equal(args.where.slug, "mindfulness-colouring-book-for-adults", "must look up by the real slug field, never a raw id");
    return { id: "cmrig9c9y000kln7861u8zs1q", price: new Prisma.Decimal(150), status: "ACTIVE" };
  });
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  // Exactly the shape getCheckoutCouponEligibleItems() in app.js now
  // sends — productSlug, not productId.
  await previewCouponHandler(
    fakeReq({ code: "TESTZERO01", items: [{ productSlug: "mindfulness-colouring-book-for-adults", quantity: 1 }] }),
    res as Response,
    next
  );

  const body = res.body as { data: { valid: boolean; discountAmount: number; freeDelivery: boolean } };
  assert.equal(body.data.valid, true);
  assert.equal(body.data.discountAmount, 150, "100% of the real R150 product price");
  assert.equal(body.data.freeDelivery, true);

  coupon.restore();
  productFindUnique.restore();
});

test("a request still using the old productId field (no productSlug at all) resolves no eligible lines — proves the old, broken shape is inert rather than silently miscounting", async () => {
  const coupon = stubCoupon();
  const productFindUnique = stub(prisma.product, "findUnique", async () => {
    throw new Error("must never be queried — there is no productSlug to look up");
  });
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await previewCouponHandler(
    fakeReq({ code: "TESTZERO01", items: [{ productId: "cmrig9c9y000kln7861u8zs1q", quantity: 1 }] }),
    res as Response,
    next
  );

  const body = res.body as { data: { valid: boolean; message: string } };
  assert.equal(body.data.valid, false);
  assert.match(body.data.message, /not valid for the products/);
  assert.equal(productFindUnique.fn.mock.callCount(), 0);

  coupon.restore();
  productFindUnique.restore();
});

test("an inactive (e.g. DRAFT) product is never coupon-eligible, looked up by slug the same as before", async () => {
  const coupon = stubCoupon();
  const productFindUnique = stub(prisma.product, "findUnique", async () => ({ id: "draft-product", price: new Prisma.Decimal(49), status: "DRAFT" }));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await previewCouponHandler(fakeReq({ code: "TESTZERO01", items: [{ productSlug: "some-draft-product", quantity: 1 }] }), res as Response, next);

  const body = res.body as { data: { valid: boolean } };
  assert.equal(body.data.valid, false);

  coupon.restore();
  productFindUnique.restore();
});

test("a variant line resolves by productSlug + variantId, verifying the variant genuinely belongs to that product's real id", async () => {
  const coupon = stubCoupon();
  const productFindUnique = stub(prisma.product, "findUnique", async () => ({ id: "real-product-id", price: new Prisma.Decimal(100), status: "ACTIVE" }));
  const variantFindFirst = stub(prisma.productVariant, "findFirst", async (args: { where: { id: string; productId: string; isActive: boolean } }) => {
    assert.equal(args.where.productId, "real-product-id", "must check ownership against the REAL id resolved from the slug, never the slug itself");
    return { price: new Prisma.Decimal(120) };
  });
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await previewCouponHandler(
    fakeReq({ code: "TESTZERO01", items: [{ productSlug: "a-book-with-variants", variantId: "variant-1", quantity: 2 }] }),
    res as Response,
    next
  );

  const body = res.body as { data: { valid: boolean; discountAmount: number } };
  assert.equal(body.data.valid, true);
  assert.equal(body.data.discountAmount, 240, "100% of R120 variant price x2");

  coupon.restore();
  productFindUnique.restore();
  variantFindFirst.restore();
});

test("two real products in one cart both count toward eligibleSubtotal — the exact multi-item scenario the bug report came from (R100 + R150 = R250)", async () => {
  const coupon = stubCoupon();
  const productFindUnique = stub(prisma.product, "findUnique", async (args: { where: { slug?: string } }) => {
    if (args.where.slug === "abc-colouring-book-for-kids-with-fun-facts") return { id: "abc-id", price: new Prisma.Decimal(100), status: "ACTIVE" };
    if (args.where.slug === "mindfulness-colouring-book-for-adults") return { id: "mindfulness-id", price: new Prisma.Decimal(150), status: "ACTIVE" };
    return null;
  });
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await previewCouponHandler(
    fakeReq({
      code: "TESTZERO01",
      items: [
        { productSlug: "abc-colouring-book-for-kids-with-fun-facts", quantity: 1 },
        { productSlug: "mindfulness-colouring-book-for-adults", quantity: 1 },
      ],
    }),
    res as Response,
    next
  );

  const body = res.body as { data: { valid: boolean; discountAmount: number } };
  assert.equal(body.data.valid, true);
  assert.equal(body.data.discountAmount, 250, "100% of R100 + R150, exactly at the R250 cap");

  coupon.restore();
  productFindUnique.restore();
});
