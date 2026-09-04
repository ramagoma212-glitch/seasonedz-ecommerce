// Version 7, Milestone 171E: dedicated backend tests for order.service.ts's
// stock-protection behaviour (verifyItems(), called from createOrder()).
// This logic already existed before this milestone (Part 8's brief
// explicitly found it already correct on audit — see this milestone's
// final report) but had no test coverage of its own anywhere in this
// backend; this file closes that gap. See productReview.service.test.ts's
// own header comment for the stub() helper pattern this file reuses —
// same Prisma Proxy-model-delegate limitation, same workaround.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { createOrder, OrderError, previewPreorderDiscount } from "./order.service.js";
import type { ValidatedOrderInput } from "../validators/order.validator.js";
import { signReferralCapture } from "../utils/referralAttributionToken.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function baseInput(overrides: Partial<ValidatedOrderInput> = {}): ValidatedOrderInput {
  return {
    customer: { firstName: "Thandiwe", lastName: "Nkosi", email: "thandiwe@example.com", phone: "+27821234567" },
    deliveryMethod: "COURIER_DOOR",
    deliveryAddress: {
      streetAddress: "1 Test St",
      suburb: "Testville",
      city: "Pretoria",
      province: "Gauteng",
      postalCode: "0001",
      country: "South Africa",
      deliveryNotes: null,
    },
    collectionCity: null,
    paymentMethod: "BANK_TRANSFER" as ValidatedOrderInput["paymentMethod"],
    items: [{ productSlug: "test-product", quantity: 1, giftWrap: false, giftMessage: null }],
    referralAttribution: null,
    ...overrides,
  };
}

// Version 7, Milestone 171E: `price` must be a real Prisma.Decimal, not
// a hand-shaped stub object — verifyItems()/createOrder() feed it
// straight into further real Decimal arithmetic (unitPrice.times(qty),
// sum.plus(lineTotal)), which throws "Invalid argument" against
// anything that isn't a genuine Decimal instance (confirmed empirically
// — the tests below that reach order-creation math failed with exactly
// that error before this fix).
const PHYSICAL_PRODUCT_BASE = {
  id: "product-1",
  slug: "test-product",
  name: "Test Colouring Book",
  sku: "TCB-1",
  status: "ACTIVE",
  price: new Prisma.Decimal(100),
  productType: "PHYSICAL",
  digitalAsset: null,
  downloadEnabled: true,
};

// ---------------------------------------------------------------------------
// Physical stock rejection (Part 8 of the milestone brief)
// ---------------------------------------------------------------------------

test("a PHYSICAL product with stockQuantity 0 is rejected as out of stock, before any order is created", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, stockQuantity: 0 }));
  const createSpy = stub(prisma.order, "create", async () => {
    throw new Error("must never be called — an out-of-stock item must be rejected before any order row is created");
  });

  await assert.rejects(
    () => createOrder(baseInput()),
    (error: unknown) => error instanceof OrderError && /out of stock/i.test(error.message)
  );
  assert.equal(createSpy.fn.mock.callCount(), 0);

  findUnique.restore();
  createSpy.restore();
});

test("requesting more quantity than is in stock is rejected with the exact remaining count", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, stockQuantity: 2 }));

  await assert.rejects(
    () => createOrder(baseInput({ items: [{ productSlug: "test-product", quantity: 3, giftWrap: false, giftMessage: null }] })),
    (error: unknown) => error instanceof OrderError && error.message.includes("Only 2") && error.message.includes("requested 3")
  );

  findUnique.restore();
});

test("requesting exactly the remaining stock quantity is allowed through the stock check itself", async () => {
  // Deliberately stubs prisma.order.create to throw AFTER the stock
  // check passes — proves verifyItems() itself accepted qty === stock,
  // without needing to mock the rest of createOrder()'s full
  // transaction (order number generation, atomic decrement, etc.) just
  // to reach a successful return.
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, stockQuantity: 2 }));
  const sentinel = new Error("reached order creation — stock check passed as expected");
  const transactionStub = stub(prisma, "$transaction", async () => {
    throw sentinel;
  });

  await assert.rejects(
    () => createOrder(baseInput({ items: [{ productSlug: "test-product", quantity: 2, giftWrap: false, giftMessage: null }] })),
    (error: unknown) => error === sentinel
  );

  findUnique.restore();
  transactionStub.restore();
});

test("a product that is not ACTIVE (e.g. ARCHIVED/DRAFT) is rejected regardless of stock quantity", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, status: "ARCHIVED", stockQuantity: 50 }));

  await assert.rejects(
    () => createOrder(baseInput()),
    (error: unknown) => error instanceof OrderError && /not currently available/i.test(error.message)
  );

  findUnique.restore();
});

test("a nonexistent product slug is rejected with a clear 'not found' error", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => null);

  await assert.rejects(
    () => createOrder(baseInput({ items: [{ productSlug: "does-not-exist", quantity: 1, giftWrap: false, giftMessage: null }] })),
    (error: unknown) => error instanceof OrderError && /not found/i.test(error.message)
  );

  findUnique.restore();
});

// ---------------------------------------------------------------------------
// Digital products: never subject to physical stock rules (Part 9)
// ---------------------------------------------------------------------------

test("a DIGITAL product with stockQuantity 0 is never rejected for stock — physical inventory rules do not apply to it", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => ({
    ...PHYSICAL_PRODUCT_BASE,
    productType: "DIGITAL",
    stockQuantity: 0,
    digitalAsset: { id: "asset-1", isActive: true },
  }));
  const sentinel = new Error("reached order creation — digital item correctly bypassed the physical stock check");
  const transactionStub = stub(prisma, "$transaction", async () => {
    throw sentinel;
  });

  await assert.rejects(
    () => createOrder(baseInput({ items: [{ productSlug: "test-product", quantity: 1, giftWrap: false, giftMessage: null }] })),
    (error: unknown) => error === sentinel
  );

  findUnique.restore();
  transactionStub.restore();
});

test("a DIGITAL product with no active file attached is rejected — a genuine availability check, distinct from stock", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => ({
    ...PHYSICAL_PRODUCT_BASE,
    productType: "DIGITAL",
    stockQuantity: 0,
    digitalAsset: null,
  }));

  await assert.rejects(
    () => createOrder(baseInput()),
    (error: unknown) => error instanceof OrderError && /not currently available for download/i.test(error.message)
  );

  findUnique.restore();
});

// ---------------------------------------------------------------------------
// Race-safe atomic decrement (transaction-level double-check)
// ---------------------------------------------------------------------------

test("even after passing the initial stock check, the transaction's own atomic decrement rejects the order if stock ran out in between (race condition)", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, stockQuantity: 5 }));
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  // updateMany's WHERE clause (stockQuantity: { gte: quantity }) matches
  // zero rows here — simulating another concurrent order having already
  // consumed the remaining stock between verifyItems() and this write.
  const updateMany = stub(prisma.product, "updateMany", async () => ({ count: 0 }));

  await assert.rejects(
    () => createOrder(baseInput({ items: [{ productSlug: "test-product", quantity: 1, giftWrap: false, giftMessage: null }] })),
    (error: unknown) => error instanceof OrderError && /not enough stock/i.test(error.message)
  );

  findUnique.restore();
  transactionStub.restore();
  updateMany.restore();
});

// ---------------------------------------------------------------------------
// Registered customer R500 free-delivery threshold (Milestone 180, Part A)
// ---------------------------------------------------------------------------

function stubSimpleOrderCreation(price: number) {
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, price: new Prisma.Decimal(price), stockQuantity: 10 }));
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const updateMany = stub(prisma.product, "updateMany", async () => ({ count: 1 }));
  const orderCreate = stub(prisma.order, "create", async ({ data }: { data: Record<string, unknown> }) =>
    fakeOrderRow({ customerId: data.customerId, subtotal: data.subtotal, deliveryFee: data.deliveryFee, total: data.total, items: [fakeOrderItemRow({ lineTotal: data.subtotal, unitPrice: data.subtotal })] })
  );
  return {
    restore: () => {
      findUnique.restore();
      transactionStub.restore();
      updateMany.restore();
      orderCreate.restore();
    },
  };
}

test("a registered (authenticated) customer at R520 eligible physical subtotal gets FREE delivery — below the R600 guest threshold but at/above the R500 registered one", async () => {
  const stubs = stubSimpleOrderCreation(520);

  const order = await createOrder(baseInput({ deliveryMethod: "COURIER_DOOR" }), "customer-1");

  assert.equal(order.deliveryFee, 0);
  stubs.restore();
});

test("a GUEST at the exact same R520 eligible physical subtotal is still charged the normal Door fee — the two thresholds never leak into each other", async () => {
  const stubs = stubSimpleOrderCreation(520);

  const order = await createOrder(baseInput({ deliveryMethod: "COURIER_DOOR" }), null);

  assert.equal(order.deliveryFee, 120);
  stubs.restore();
});

test("a registered customer below even the lower R500 threshold (R499) is still charged the normal fee", async () => {
  const stubs = stubSimpleOrderCreation(499);

  const order = await createOrder(baseInput({ deliveryMethod: "COURIER_LOCKER" }), "customer-1");

  assert.equal(order.deliveryFee, 100);
  stubs.restore();
});

test("registered-customer eligibility is derived only from the already-verified customerId parameter — never from anything in the request body itself", async () => {
  // ValidatedOrderInput (order.validator.ts's own output type) has no
  // registeredCustomer-shaped field at all to smuggle a claim through in
  // the first place — this test asserts the actual, load-bearing
  // property: passing customerId=null behaves as guest even though the
  // rest of the input is identical to the registered-customer test
  // above, proving the boolean genuinely comes from the second
  // parameter alone.
  const stubs = stubSimpleOrderCreation(520);

  const order = await createOrder(baseInput({ deliveryMethod: "COURIER_DOOR" }), null);

  assert.equal(order.deliveryFee, 120, "customerId null must always mean guest, regardless of anything else in the input");
  stubs.restore();
});

// ---------------------------------------------------------------------------
// Preorder system + first-registered-customer preorder discount
// (Milestone 181)
// ---------------------------------------------------------------------------

const ACTIVE_PREORDER_FIELDS = {
  isPreorderEnabled: true,
  preorderStartAt: null,
  preorderEndAt: null,
  preorderReleaseAt: new Date("2026-09-30T00:00:00.000Z"),
  isPreorderDiscountEligible: true,
};

function stubPreorderProgrammeSettings(overrides: Record<string, unknown> = {}) {
  return stub(prisma.preorderProgrammeSettings, "findFirst", async () => ({
    id: "preorder-settings-1",
    firstRegisteredPreorderDiscountEnabled: true,
    firstRegisteredPreorderDiscountPercent: new Prisma.Decimal("10.00"),
    updatedByAdminUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }));
}

function stubNoActiveRedemption() {
  return stub(prisma.preorderDiscountRedemption, "findFirst", async () => null);
}

function stubHasActiveRedemption() {
  return stub(prisma.preorderDiscountRedemption, "findFirst", async () => ({ id: "existing-redemption" }));
}

function stubReservationCreate() {
  return stub(prisma.preorderDiscountRedemption, "create", async () => ({}));
}

// One preorder-eligible product at the given price, with a single item
// in the cart — the minimal setup every "does line X get 10%" test
// needs. `orderCreateOverride` lets a test inspect exactly what was
// passed to prisma.order.create (data.items.create[0], etc.).
function stubPreorderOrderCreation(price: number, productOverrides: Record<string, unknown> = {}) {
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, ...ACTIVE_PREORDER_FIELDS, ...productOverrides, price: new Prisma.Decimal(price), stockQuantity: 10 }));
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const updateMany = stub(prisma.product, "updateMany", async () => ({ count: 1 }));
  let capturedCreateData: Record<string, unknown> | null = null;
  const orderCreate = stub(prisma.order, "create", async ({ data }: { data: Record<string, unknown> }) => {
    capturedCreateData = data;
    const items = (data.items as { create: Record<string, unknown>[] }).create;
    return fakeOrderRow({
      customerId: data.customerId,
      subtotal: data.subtotal,
      giftWrapTotal: data.giftWrapTotal,
      deliveryFee: data.deliveryFee,
      discountTotal: data.discountTotal,
      total: data.total,
      containsPreorder: data.containsPreorder,
      latestPreorderReleaseAt: data.latestPreorderReleaseAt,
      items: items.map((item, index) => fakeOrderItemRow({ id: `order-item-${index + 1}`, ...item })),
    });
  });
  return {
    getCapturedCreateData: () => capturedCreateData,
    restore: () => {
      findUnique.restore();
      transactionStub.restore();
      updateMany.restore();
      orderCreate.restore();
    },
  };
}

test("guest never receives the first-registered-customer preorder discount, even on an eligible preorder line", async () => {
  const settings = stubPreorderProgrammeSettings();
  const stubs = stubPreorderOrderCreation(120);

  const order = await createOrder(baseInput({ deliveryMethod: "COLLECTION" }), null);

  assert.equal(order.preorderDiscountApplied, false);
  assert.equal(order.discountTotal, 0);
  assert.equal(order.containsPreorder, true, "still flagged as containing a preorder item, for the fulfilment hold, even though the guest gets no discount");

  settings.restore();
  stubs.restore();
});

test("a registered customer's first qualifying preorder order receives exactly 10% off the eligible line", async () => {
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const reservationCreate = stubReservationCreate();
  const stubs = stubPreorderOrderCreation(120);

  const order = await createOrder(baseInput({ deliveryMethod: "COLLECTION" }), "customer-1");

  assert.equal(order.preorderDiscountApplied, true);
  assert.equal(order.preorderDiscountTotal, 12, "10% of R120 = R12");
  assert.equal(order.discountTotal, 12);
  assert.equal(order.total, 108, "R120 - R12 discount + R0 delivery (Collection)");
  assert.equal(reservationCreate.fn.mock.callCount(), 1, "the one-time benefit must be reserved");

  settings.restore();
  noRedemption.restore();
  reservationCreate.restore();
  stubs.restore();
});

test("a registered customer who has already used the benefit does not receive it a second time", async () => {
  const settings = stubPreorderProgrammeSettings();
  const alreadyUsed = stubHasActiveRedemption();
  const reservationCreate = stub(prisma.preorderDiscountRedemption, "create", async () => {
    throw new Error("must never be called — customer already has an active redemption");
  });
  const stubs = stubPreorderOrderCreation(120);

  const order = await createOrder(baseInput({ deliveryMethod: "COLLECTION" }), "customer-1");

  assert.equal(order.preorderDiscountApplied, false);
  assert.equal(order.discountTotal, 0);
  assert.equal(reservationCreate.fn.mock.callCount(), 0);

  settings.restore();
  alreadyUsed.restore();
  reservationCreate.restore();
  stubs.restore();
});

test("the programme being disabled means no order ever receives the discount, even a genuinely first-time registered customer", async () => {
  const settings = stubPreorderProgrammeSettings({ firstRegisteredPreorderDiscountEnabled: false });
  const noRedemption = stubNoActiveRedemption();
  const stubs = stubPreorderOrderCreation(120);

  const order = await createOrder(baseInput({ deliveryMethod: "COLLECTION" }), "customer-1");

  assert.equal(order.preorderDiscountApplied, false);

  settings.restore();
  noRedemption.restore();
  stubs.restore();
});

test("a non-preorder product never receives the 10% discount, even for a genuinely first-time registered customer", async () => {
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  // Ordinary product — no preorder fields set at all (defaults false).
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, price: new Prisma.Decimal(120), stockQuantity: 10 }));
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const updateMany = stub(prisma.product, "updateMany", async () => ({ count: 1 }));
  const orderCreate = stub(prisma.order, "create", async ({ data }: { data: Record<string, unknown> }) => fakeOrderRow({ customerId: data.customerId, subtotal: data.subtotal, discountTotal: data.discountTotal, total: data.total }));

  const order = await createOrder(baseInput({ deliveryMethod: "COLLECTION" }), "customer-1");

  assert.equal(order.preorderDiscountApplied, false);
  assert.equal(order.discountTotal, 0);
  assert.equal(order.containsPreorder, false);

  settings.restore();
  noRedemption.restore();
  findUnique.restore();
  transactionStub.restore();
  updateMany.restore();
  orderCreate.restore();
});

test("Part E worked example: multiple eligible preorder lines in one order ALL receive 10%, summed correctly", async () => {
  // Old Testament R120, New Testament R120, ABC R100 — all preorder-eligible.
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const reservationCreate = stub(prisma.preorderDiscountRedemption, "create", async (args: { data: Record<string, unknown> }) => {
    assert.equal((args.data.discountAmountSnapshot as Prisma.Decimal).toNumber(), 34, "10% of R340 = R34");
    return {};
  });

  const findUnique = stub(prisma.product, "findUnique", async (args: { where: { slug: string } }) => {
    const prices: Record<string, number> = { "old-testament": 120, "new-testament": 120, abc: 100 };
    const price = prices[args.where.slug] ?? 0;
    return { ...PHYSICAL_PRODUCT_BASE, ...ACTIVE_PREORDER_FIELDS, slug: args.where.slug, price: new Prisma.Decimal(price), stockQuantity: 10 };
  });
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const updateMany = stub(prisma.product, "updateMany", async () => ({ count: 1 }));
  const orderCreate = stub(prisma.order, "create", async ({ data }: { data: Record<string, unknown> }) => {
    const items = (data.items as { create: Record<string, unknown>[] }).create;
    return fakeOrderRow({
      customerId: data.customerId,
      subtotal: data.subtotal,
      discountTotal: data.discountTotal,
      total: data.total,
      items: items.map((item, index) => fakeOrderItemRow({ id: `order-item-${index + 1}`, ...item })),
    });
  });

  const order = await createOrder(
    baseInput({
      deliveryMethod: "COLLECTION",
      items: [
        { productSlug: "old-testament", quantity: 1, giftWrap: false, giftMessage: null },
        { productSlug: "new-testament", quantity: 1, giftWrap: false, giftMessage: null },
        { productSlug: "abc", quantity: 1, giftWrap: false, giftMessage: null },
      ],
    }),
    "customer-1"
  );

  assert.equal(order.preorderDiscountTotal, 34);
  assert.equal(order.items.filter((item) => item.preorderDiscountAmount !== null).length, 3, "all three lines received the discount");
  assert.equal(order.total, 306, "R340 - R34");

  settings.restore();
  noRedemption.restore();
  reservationCreate.restore();
  findUnique.restore();
  transactionStub.restore();
  updateMany.restore();
  orderCreate.restore();
});

test("Part J: gift wrap is excluded from the preorder discount — only the R120 product line is discounted, never the R30 wrap fee", async () => {
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const reservationCreate = stubReservationCreate();
  const stubs = stubPreorderOrderCreation(120);

  const order = await createOrder(baseInput({ deliveryMethod: "COLLECTION", items: [{ productSlug: "test-product", quantity: 1, giftWrap: true, giftMessage: null }] }), "customer-1");

  assert.equal(order.preorderDiscountTotal, 12, "10% of R120 physical line only, never the R30 gift wrap");
  assert.equal(order.giftWrapTotal, 30);

  settings.restore();
  noRedemption.restore();
  reservationCreate.restore();
  stubs.restore();
});

test("Part I: the registered R500 free-delivery threshold is judged on the ORIGINAL pre-preorder-discount subtotal", async () => {
  // R500 physical subtotal before discount qualifies for free delivery
  // even though the actual discounted amount (R450) is below it.
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const reservationCreate = stubReservationCreate();
  const stubs = stubPreorderOrderCreation(500);

  const order = await createOrder(baseInput({ deliveryMethod: "COURIER_DOOR" }), "customer-1");

  assert.equal(order.deliveryFee, 0, "still FREE — R500 pre-discount physical subtotal meets the registered threshold");
  assert.equal(order.preorderDiscountTotal, 50, "10% of R500");

  settings.restore();
  noRedemption.restore();
  reservationCreate.restore();
  stubs.restore();
});

test("Part H: preorder discount (10%) wins over the referral discount (5%) on the same eligible line — never both stacked", async () => {
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const reservationCreate = stubReservationCreate();
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => affiliateRow());
  const productSettingFind = stub(prisma.affiliateProductSetting, "findMany", async () => []);
  const commissionCreate = stub(prisma.orderAffiliateCommission, "create", async () => ({}));
  const productCommissionCreateMany = stub(prisma.orderAffiliateProductCommission, "createMany", async () => ({ count: 0 }));
  const stubs = stubPreorderOrderCreation(120);

  const referralAttribution = signReferralCapture("alice-1");
  const order = await createOrder(baseInput({ deliveryMethod: "COLLECTION", referralAttribution }), "customer-1");

  // 10% of R120 = R12 (preorder), never 15% (R18) — the referral 5%
  // never applies on top of the preorder discount on this same line,
  // and since this is the ONLY line in the order, the referral itself
  // has nothing left to discount.
  assert.equal(order.discountTotal, 12);
  assert.equal(order.total, 108);

  settings.restore();
  noRedemption.restore();
  reservationCreate.restore();
  settingsFind.restore();
  affiliateFind.restore();
  productSettingFind.restore();
  commissionCreate.restore();
  productCommissionCreateMany.restore();
  stubs.restore();
});

test("Part H: a mixed order still gives the ordinary 5% referral discount to the NON-preorder line", async () => {
  // Preorder line R120 (gets 10% = R12), ordinary line R100 (gets the
  // usual 5% referral = R5). Total discount: R17, never R12 + (5% of
  // R220 = R11) = R23 (which would double-count the preorder line under
  // the referral rate too).
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const reservationCreate = stubReservationCreate();
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => affiliateRow());
  const productSettingFind = stub(prisma.affiliateProductSetting, "findMany", async () => []);
  const commissionCreate = stub(prisma.orderAffiliateCommission, "create", async () => ({}));
  const productCommissionCreateMany = stub(prisma.orderAffiliateProductCommission, "createMany", async () => ({ count: 0 }));

  const findUnique = stub(prisma.product, "findUnique", async (args: { where: { slug: string } }) => {
    if (args.where.slug === "preorder-product") return { ...PHYSICAL_PRODUCT_BASE, ...ACTIVE_PREORDER_FIELDS, slug: "preorder-product", price: new Prisma.Decimal(120), stockQuantity: 10 };
    return { ...PHYSICAL_PRODUCT_BASE, slug: "ordinary-product", price: new Prisma.Decimal(100), stockQuantity: 10 };
  });
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const updateMany = stub(prisma.product, "updateMany", async () => ({ count: 1 }));
  const orderCreate = stub(prisma.order, "create", async ({ data }: { data: Record<string, unknown> }) => {
    const items = (data.items as { create: Record<string, unknown>[] }).create;
    return fakeOrderRow({ customerId: data.customerId, subtotal: data.subtotal, discountTotal: data.discountTotal, total: data.total, items: items.map((item, index) => fakeOrderItemRow({ id: `order-item-${index + 1}`, ...item })) });
  });

  const referralAttribution = signReferralCapture("alice-1");
  const order = await createOrder(
    baseInput({
      deliveryMethod: "COLLECTION",
      referralAttribution,
      items: [
        { productSlug: "preorder-product", quantity: 1, giftWrap: false, giftMessage: null },
        { productSlug: "ordinary-product", quantity: 1, giftWrap: false, giftMessage: null },
      ],
    }),
    "customer-1"
  );

  assert.equal(order.discountTotal, 17, "R12 preorder (10% of R120) + R5 referral (5% of R100 ordinary line only)");

  settings.restore();
  noRedemption.restore();
  reservationCreate.restore();
  settingsFind.restore();
  affiliateFind.restore();
  productSettingFind.restore();
  commissionCreate.restore();
  productCommissionCreateMany.restore();
  findUnique.restore();
  transactionStub.restore();
  updateMany.restore();
  orderCreate.restore();
});

test("scheduled (not yet started) preorder is never discount-eligible, even for a first-time registered customer", async () => {
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const stubs = stubPreorderOrderCreation(120, { preorderStartAt: new Date("2099-01-01T00:00:00.000Z") });

  const order = await createOrder(baseInput({ deliveryMethod: "COLLECTION" }), "customer-1");

  assert.equal(order.preorderDiscountApplied, false);
  assert.equal(order.containsPreorder, false, "not yet started means not an active preorder at all");

  settings.restore();
  noRedemption.restore();
  stubs.restore();
});

test("ended preorder (release date passed) resumes normal sale — no discount, no ship-together hold", async () => {
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const stubs = stubPreorderOrderCreation(120, { preorderReleaseAt: new Date("2020-01-01T00:00:00.000Z") });

  const order = await createOrder(baseInput({ deliveryMethod: "COLLECTION" }), "customer-1");

  assert.equal(order.preorderDiscountApplied, false);
  assert.equal(order.containsPreorder, false);
  assert.equal(order.latestPreorderReleaseAt, null);

  settings.restore();
  noRedemption.restore();
  stubs.restore();
});

test("a concurrent reservation attempt for the same customer is rejected, rolling back the whole order rather than persisting a mismatched discount", async () => {
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const reservationCreate = stub(prisma.preorderDiscountRedemption, "create", async () => {
    throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5.22.0" });
  });
  const stubs = stubPreorderOrderCreation(120);

  await assert.rejects(() => createOrder(baseInput({ deliveryMethod: "COLLECTION" }), "customer-1"));

  settings.restore();
  noRedemption.restore();
  reservationCreate.restore();
  stubs.restore();
});

// ---------------------------------------------------------------------------
// Part J: stock bypass for an explicitly active preorder Product.
// ---------------------------------------------------------------------------

test("Part J: an active preorder Product with zero stock is still purchasable — the ordinary stock gate never applies to it", async () => {
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const reservationCreate = stubReservationCreate();
  const findUnique = stub(prisma.product, "findUnique", async () => ({
    ...PHYSICAL_PRODUCT_BASE,
    ...ACTIVE_PREORDER_FIELDS,
    price: new Prisma.Decimal(120),
    stockQuantity: 0,
  }));
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const updateMany = stub(prisma.product, "updateMany", async () => ({ count: 0 }));
  const orderCreate = stub(prisma.order, "create", async ({ data }: { data: Record<string, unknown> }) => {
    const items = (data.items as { create: Record<string, unknown>[] }).create;
    return fakeOrderRow({
      containsPreorder: data.containsPreorder,
      latestPreorderReleaseAt: data.latestPreorderReleaseAt,
      items: items.map((item, index) => fakeOrderItemRow({ id: `order-item-${index + 1}`, ...item })),
    });
  });

  // Must not throw "Product is out of stock" / "Not enough stock" —
  // an active preorder line bypasses both the verifyItems() stock
  // check and the transaction's stock-decrement guard.
  const order = await createOrder(baseInput({ deliveryMethod: "COLLECTION" }), "customer-1");
  assert.equal(order.containsPreorder, true);

  // The zero-stock product.updateMany guard (which would otherwise
  // reject the order for insufficient stock) must never even be
  // called for this line — see the next test for the explicit call
  // assertion.
  assert.equal(updateMany.fn.mock.callCount(), 0);

  settings.restore();
  noRedemption.restore();
  reservationCreate.restore();
  findUnique.restore();
  transactionStub.restore();
  updateMany.restore();
  orderCreate.restore();
});

test("Part J: an active preorder line's stock is never decremented, even when the Product does carry some real stock", async () => {
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const reservationCreate = stubReservationCreate();
  const stubs = stubPreorderOrderCreation(120); // stockQuantity: 10, per stubPreorderOrderCreation's own default

  await createOrder(baseInput({ deliveryMethod: "COLLECTION" }), "customer-1");

  // stubPreorderOrderCreation's own product.updateMany stub always
  // resolves { count: 1 } if called — this asserts it was never
  // called at all for the preorder line.
  const updateManyCalls = (prisma.product.updateMany as unknown as { mock: { callCount: () => number } }).mock.callCount();
  assert.equal(updateManyCalls, 0);

  settings.restore();
  noRedemption.restore();
  reservationCreate.restore();
  stubs.restore();
});

test("normal stock rules resume for a Product once its preorder has ended — zero stock blocks the order again", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => ({
    ...PHYSICAL_PRODUCT_BASE,
    ...ACTIVE_PREORDER_FIELDS,
    preorderReleaseAt: new Date("2020-01-01T00:00:00.000Z"), // ended long ago
    price: new Prisma.Decimal(120),
    stockQuantity: 0,
  }));

  await assert.rejects(
    () => createOrder(baseInput({ deliveryMethod: "COLLECTION" }), "customer-1"),
    /out of stock/i
  );

  findUnique.restore();
});

// ---------------------------------------------------------------------------
// Part L: previewPreorderDiscount() — the cart/checkout non-binding
// preview, never a reservation.
// ---------------------------------------------------------------------------

test("preview: a guest never qualifies, regardless of cart contents", async () => {
  const settings = stubPreorderProgrammeSettings();

  const result = await previewPreorderDiscount(null, [{ productSlug: "preorder-book", quantity: 1 }]);
  assert.equal(result.qualifies, false);
  assert.equal(result.discountAmount, 0);
  assert.equal(result.alreadyUsed, false);

  settings.restore();
});

test("preview: no eligible preorder items in the cart never qualifies", async () => {
  const settings = stubPreorderProgrammeSettings();
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, price: new Prisma.Decimal(100), isPreorderEnabled: false }));

  const result = await previewPreorderDiscount("customer-1", [{ productSlug: "ordinary-product", quantity: 1 }]);
  assert.equal(result.qualifies, false);
  assert.equal(result.alreadyUsed, false);

  settings.restore();
  findUnique.restore();
});

test("preview: a first-time registered customer with an eligible line sees the real would-be discount", async () => {
  const settings = stubPreorderProgrammeSettings();
  const noRedemption = stubNoActiveRedemption();
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, ...ACTIVE_PREORDER_FIELDS, price: new Prisma.Decimal(120) }));

  const result = await previewPreorderDiscount("customer-1", [{ productSlug: "preorder-book", quantity: 1 }]);
  assert.equal(result.qualifies, true);
  assert.equal(result.discountPercent, 10);
  assert.equal(result.discountAmount, 12);
  assert.equal(result.alreadyUsed, false);

  settings.restore();
  noRedemption.restore();
  findUnique.restore();
});

test("preview: a customer who already used the benefit sees alreadyUsed, never a misleading qualifying amount", async () => {
  const settings = stubPreorderProgrammeSettings();
  const hasRedemption = stubHasActiveRedemption();
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, ...ACTIVE_PREORDER_FIELDS, price: new Prisma.Decimal(120) }));

  const result = await previewPreorderDiscount("customer-1", [{ productSlug: "preorder-book", quantity: 1 }]);
  assert.equal(result.qualifies, false);
  assert.equal(result.discountAmount, 0);
  assert.equal(result.alreadyUsed, true);

  settings.restore();
  hasRedemption.restore();
  findUnique.restore();
});

test("preview: the programme being disabled never qualifies, even with an eligible line and a first-time customer", async () => {
  const settings = stubPreorderProgrammeSettings({ firstRegisteredPreorderDiscountEnabled: false });
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, ...ACTIVE_PREORDER_FIELDS, price: new Prisma.Decimal(120) }));

  const result = await previewPreorderDiscount("customer-1", [{ productSlug: "preorder-book", quantity: 1 }]);
  assert.equal(result.qualifies, false);

  settings.restore();
  findUnique.restore();
});

// ---------------------------------------------------------------------------
// Referral discount/commission wiring (Version 7, Milestone 172B.4)
// ---------------------------------------------------------------------------

const SETTINGS_ROW = {
  id: "settings-1",
  defaultCommissionRate: new Prisma.Decimal("7.00"),
  defaultReferralDiscountRate: new Prisma.Decimal("5.00"),
  attributionWindowDays: 30,
  commissionValidationDays: 30,
  minimumPayoutAmount: new Prisma.Decimal("500.00"),
  payoutDayOfMonth: 15,
  isProgrammeActive: true,
  updatedByAdminUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function affiliateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "affiliate-1",
    customerId: null,
    name: "Alice Affiliate",
    email: "alice@example.com",
    phone: null,
    referralCode: "alice-1",
    status: "ACTIVE",
    commissionRateOverride: null,
    discountRateOverride: null,
    approvedAt: new Date(),
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// The minimal fields toOrderOutput() actually dereferences — items/
// payment/shipping are left empty/null so its own mapping short-
// circuits, matching this file's existing "stub only what's read"
// discipline.
function fakeOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    orderNumber: "SZ-TEST-1",
    createdAt: new Date(),
    customerFirstName: "Thandiwe",
    customerLastName: "Nkosi",
    customerEmail: "thandiwe@example.com",
    customerPhone: "+27821234567",
    deliveryMethod: "COLLECTION",
    deliveryStreetAddress: null,
    deliverySuburb: null,
    deliveryCity: null,
    deliveryProvince: null,
    deliveryPostalCode: null,
    deliveryCountry: "South Africa",
    deliveryNotes: null,
    collectionCity: "Pretoria",
    status: "PENDING",
    paymentStatus: "PENDING",
    fulfilmentStatus: "NOT_STARTED",
    paymentMethod: "BANK_TRANSFER",
    items: [],
    subtotal: new Prisma.Decimal(0),
    giftWrapTotal: new Prisma.Decimal(0),
    deliveryFee: new Prisma.Decimal(0),
    discountTotal: new Prisma.Decimal(0),
    total: new Prisma.Decimal(0),
    payment: null,
    shipping: null,
    // Milestone 181: explicit non-preorder defaults — same "never
    // undefined" reasoning as fakeOrderItemRow above.
    containsPreorder: false,
    latestPreorderReleaseAt: null,
    ...overrides,
  };
}

function referralInput(referralAttribution: ValidatedOrderInput["referralAttribution"], overrides: Partial<ValidatedOrderInput> = {}) {
  return baseInput({
    deliveryMethod: "COLLECTION",
    deliveryAddress: null,
    collectionCity: "Pretoria",
    items: [{ productSlug: "test-product", quantity: 1, giftWrap: false, giftMessage: null }],
    referralAttribution,
    ...overrides,
  });
}

// Wires up the full stub set a referral-path test needs: a R500
// PHYSICAL product, a real (unstubbed) settings lookup via the stubbed
// affiliateProgrammeSettings row, a stubbed affiliate row, and a
// transaction whose tx.order.create/tx.orderAffiliateCommission.create
// are both spies. Returns the spies plus a restore() that undoes every
// stub, so each test stays a single call at the end.
// Milestone 178, Part C: by default this product IS affiliate-eligible
// with no per-product override at all (commissionPercent: null) —
// deliberately reproducing the exact pre-178 flat-rate behaviour, so
// the referral tests below that assert the R33.25 worked-example
// commission keep proving that unchanged behaviour, now routed through
// the new per-product code path instead of the old flat calculation.
// Milestone 178, Part C: createOrder() now reads createdOrder.items to
// build the per-product commission breakdown, so these mocks need a
// fully-shaped OrderItem row (toOrderOutput() itself also dereferences
// every one of these fields), not the empty array pre-178 tests could
// get away with.
function fakeOrderItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-item-1",
    productId: "product-1",
    productSlug: "test-product",
    productName: "Test Colouring Book",
    sku: "TCB-1",
    quantity: 1,
    unitPrice: new Prisma.Decimal("500.00"),
    lineTotal: new Prisma.Decimal("500.00"),
    productType: "PHYSICAL",
    isGiftWrapped: false,
    giftMessage: null,
    giftWrapFeePerUnit: null,
    // Milestone 181: explicit non-preorder defaults — never left
    // `undefined`, which would make toOrderOutput()'s own
    // `!== null` checks silently misbehave for every pre-181 test that
    // never mentions these fields.
    isPreorderAtPurchase: false,
    preorderReleaseAtSnapshot: null,
    preorderDiscountRateApplied: null,
    preorderDiscountAmountApplied: null,
    ...overrides,
  };
}

const ELIGIBLE_PRODUCT_SETTING_ROW = {
  id: "setting-1",
  productId: "product-1",
  commissionType: "PERCENTAGE" as const,
  commissionPercent: null,
  fixedCommissionAmount: null,
  isAffiliateAvailable: true,
  startsAt: null,
  endsAt: null,
  maximumCommission: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function stubReferralOrderCreation(affiliate: ReturnType<typeof affiliateRow> | null, productSettings: Record<string, unknown>[] = [ELIGIBLE_PRODUCT_SETTING_ROW]) {
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, price: new Prisma.Decimal("500.00"), stockQuantity: 10 }));
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => affiliate);
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const updateMany = stub(prisma.product, "updateMany", async () => ({ count: 1 }));
  const orderCreate = stub(prisma.order, "create", async ({ data }: { data: Record<string, unknown> }) => {
    // Milestone 178, Part C: createOrder() now reads createdOrder.items
    // (the real created rows, with real ids) to build the per-product
    // commission breakdown — this mock returns one realistic item
    // matching what a real single-line R500 order would produce, so
    // that code path has something to work with, same as it would
    // against the real database.
    const items = [fakeOrderItemRow({ lineTotal: data.subtotal, unitPrice: data.subtotal })];
    return fakeOrderRow({ subtotal: data.subtotal, discountTotal: data.discountTotal, total: data.total, items });
  });
  const commissionCreate = stub(prisma.orderAffiliateCommission, "create", async () => ({}));
  const productSettingFind = stub(prisma.affiliateProductSetting, "findMany", async () => productSettings);
  const productCommissionCreateMany = stub(prisma.orderAffiliateProductCommission, "createMany", async () => ({ count: 0 }));

  return {
    orderCreate,
    commissionCreate,
    productCommissionCreateMany,
    restore: () => {
      findUnique.restore();
      settingsFind.restore();
      affiliateFind.restore();
      transactionStub.restore();
      updateMany.restore();
      orderCreate.restore();
      commissionCreate.restore();
      productSettingFind.restore();
      productCommissionCreateMany.restore();
    },
  };
}

test("a valid, ACTIVE-affiliate referral reduces the order total and creates exactly one PENDING commission", async () => {
  const stubs = stubReferralOrderCreation(affiliateRow());
  const referralAttribution = signReferralCapture("alice-1");

  const order = await createOrder(referralInput(referralAttribution));

  assert.equal(order.discountTotal, 25);
  assert.equal(order.total, 475);
  assert.equal(stubs.commissionCreate.fn.mock.callCount(), 1);
  const commissionCall = stubs.commissionCreate.fn.mock.calls[0];
  assert.ok(commissionCall);
  const commissionData = commissionCall.arguments[0].data;
  assert.equal(commissionData.status, "PENDING");
  assert.equal(commissionData.discountAmount.toString(), "25");
  assert.equal(commissionData.commissionAmount.toString(), "33.25");
  assert.equal(commissionData.affiliateId, "affiliate-1");

  stubs.restore();
});

test("self-referral: the discount still applies, but no OrderAffiliateCommission row is ever created", async () => {
  // Matches referralInput()'s own customer.email (via baseInput) —
  // exactly the guest-checkout self-referral path isSelfReferral()
  // falls back to when the affiliate has no linked customerId.
  const stubs = stubReferralOrderCreation(affiliateRow({ email: "thandiwe@example.com" }));
  const referralAttribution = signReferralCapture("alice-1");

  const order = await createOrder(referralInput(referralAttribution));

  assert.equal(order.discountTotal, 25);
  assert.equal(order.total, 475);
  assert.equal(stubs.commissionCreate.fn.mock.callCount(), 0);

  stubs.restore();
});

test("an attribution older than the current attributionWindowDays is silently ignored — order proceeds at full price", async () => {
  const stubs = stubReferralOrderCreation(affiliateRow());
  const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
  const referralAttribution = signReferralCapture("alice-1", fortyDaysAgo);

  const order = await createOrder(referralInput(referralAttribution));

  assert.equal(order.discountTotal, 0);
  assert.equal(order.total, 500);
  assert.equal(stubs.commissionCreate.fn.mock.callCount(), 0);

  stubs.restore();
});

test("a tampered signature is silently ignored — never blocks or errors the order", async () => {
  const stubs = stubReferralOrderCreation(affiliateRow());
  const real = signReferralCapture("alice-1");
  const tampered = { ...real, signature: "0".repeat(real.signature.length) };

  const order = await createOrder(referralInput(tampered));

  assert.equal(order.discountTotal, 0);
  assert.equal(stubs.commissionCreate.fn.mock.callCount(), 0);

  stubs.restore();
});

test("a SUSPENDED affiliate's referral code is silently ignored", async () => {
  const stubs = stubReferralOrderCreation(affiliateRow({ status: "SUSPENDED" }));
  const referralAttribution = signReferralCapture("alice-1");

  const order = await createOrder(referralInput(referralAttribution));

  assert.equal(order.discountTotal, 0);
  assert.equal(stubs.commissionCreate.fn.mock.callCount(), 0);

  stubs.restore();
});

test("an unknown referral code (no matching affiliate) is silently ignored", async () => {
  const stubs = stubReferralOrderCreation(null);
  const referralAttribution = signReferralCapture("does-not-exist");

  const order = await createOrder(referralInput(referralAttribution));

  assert.equal(order.discountTotal, 0);
  assert.equal(stubs.commissionCreate.fn.mock.callCount(), 0);

  stubs.restore();
});

test("no referralAttribution at all behaves exactly as before this milestone — discountTotal 0, no commission", async () => {
  const stubs = stubReferralOrderCreation(affiliateRow());

  const order = await createOrder(referralInput(null));

  assert.equal(order.discountTotal, 0);
  assert.equal(stubs.commissionCreate.fn.mock.callCount(), 0);

  stubs.restore();
});

test("the R600 free-delivery threshold is judged against the ORIGINAL pre-discount physical subtotal, not the post-discount total", async () => {
  // R620 product, COURIER_DOOR: pre-discount R620 already clears the
  // R600 threshold (free delivery), even though the 5% referral
  // discount brings the customer's actual paid subtotal down to R589 —
  // an explicit required case from the milestone brief.
  const findUnique = stub(prisma.product, "findUnique", async () => ({ ...PHYSICAL_PRODUCT_BASE, price: new Prisma.Decimal("620.00"), stockQuantity: 10 }));
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => SETTINGS_ROW);
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => affiliateRow());
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  const updateMany = stub(prisma.product, "updateMany", async () => ({ count: 1 }));
  const orderCreate = stub(prisma.order, "create", async ({ data }: { data: Record<string, unknown> }) =>
    fakeOrderRow({
      subtotal: data.subtotal,
      discountTotal: data.discountTotal,
      deliveryFee: data.deliveryFee,
      total: data.total,
      items: [fakeOrderItemRow({ lineTotal: data.subtotal, unitPrice: data.subtotal })],
    })
  );
  const commissionCreate = stub(prisma.orderAffiliateCommission, "create", async () => ({}));
  const productSettingFind = stub(prisma.affiliateProductSetting, "findMany", async () => [ELIGIBLE_PRODUCT_SETTING_ROW]);
  const productCommissionCreateMany = stub(prisma.orderAffiliateProductCommission, "createMany", async () => ({ count: 0 }));

  const referralAttribution = signReferralCapture("alice-1");
  const order = await createOrder(
    referralInput(referralAttribution, {
      deliveryMethod: "COURIER_DOOR",
      deliveryAddress: {
        streetAddress: "1 Test St",
        suburb: "Testville",
        city: "Pretoria",
        province: "Gauteng",
        postalCode: "0001",
        country: "South Africa",
        deliveryNotes: null,
      },
      collectionCity: null,
    })
  );

  assert.equal(order.deliveryFee, 0, "delivery must still be FREE — the threshold uses the R620 pre-discount subtotal");
  assert.equal(order.discountTotal, 31, "5% of R620 = R31.00");
  assert.equal(order.total, 589, "R620 - R31 discount + R0 delivery");

  findUnique.restore();
  settingsFind.restore();
  affiliateFind.restore();
  transactionStub.restore();
  updateMany.restore();
  orderCreate.restore();
  commissionCreate.restore();
  productSettingFind.restore();
  productCommissionCreateMany.restore();
});

// ---------------------------------------------------------------------------
// Per-product affiliate commission (Milestone 178, Part C).
// ---------------------------------------------------------------------------

test("a referred order for a product with no AffiliateProductSetting row at all still creates the commission row (discount unaffected) but with a zero commissionAmount and no breakdown rows", async () => {
  const stubs = stubReferralOrderCreation(affiliateRow(), []); // no setting rows returned at all
  const referralAttribution = signReferralCapture("alice-1");

  const order = await createOrder(referralInput(referralAttribution));

  assert.equal(order.discountTotal, 25, "the customer discount is unconditional — never depends on affiliate product eligibility");
  assert.equal(stubs.commissionCreate.fn.mock.callCount(), 1);
  const commissionData = stubs.commissionCreate.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(commissionData.commissionAmount.toString(), "0");
  assert.equal(commissionData.qualifyingProductSubtotal.toString(), "0");
  assert.equal(stubs.productCommissionCreateMany.fn.mock.callCount(), 0, "nothing eligible means no breakdown rows at all");

  stubs.restore();
});

test("a product with a per-product PERCENTAGE override uses that rate instead of the affiliate's own, and writes one matching OrderAffiliateProductCommission row", async () => {
  const stubs = stubReferralOrderCreation(affiliateRow(), [{ ...ELIGIBLE_PRODUCT_SETTING_ROW, commissionPercent: new Prisma.Decimal("15.00") }]);
  const referralAttribution = signReferralCapture("alice-1");

  await createOrder(referralInput(referralAttribution));

  const commissionData = stubs.commissionCreate.fn.mock.calls[0]!.arguments[0].data;
  // R500 * 0.95 = R475 net, 15% = R71.25 — not the affiliate's own 7%.
  assert.equal(commissionData.commissionAmount.toString(), "71.25");

  assert.equal(stubs.productCommissionCreateMany.fn.mock.callCount(), 1);
  const rows = stubs.productCommissionCreateMany.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].commissionType, "PERCENTAGE");
  assert.equal(rows[0].commissionPercent.toString(), "15");
  assert.equal(rows[0].calculatedCommission.toString(), "71.25");
  assert.equal(rows[0].orderItemId, "order-item-1");
  assert.equal(rows[0].productId, "product-1");
  assert.equal(rows[0].affiliateId, "affiliate-1");

  stubs.restore();
});

test("a FIXED_AMOUNT product commission is per-unit, capped by maximumCommission, and completely independent of the referral discount rate", async () => {
  const stubs = stubReferralOrderCreation(affiliateRow(), [
    { ...ELIGIBLE_PRODUCT_SETTING_ROW, commissionType: "FIXED_AMOUNT", commissionPercent: null, fixedCommissionAmount: new Prisma.Decimal("50.00"), maximumCommission: new Prisma.Decimal("40.00") },
  ]);
  const referralAttribution = signReferralCapture("alice-1");

  await createOrder(referralInput(referralAttribution));

  const commissionData = stubs.commissionCreate.fn.mock.calls[0]!.arguments[0].data;
  // Uncapped would be R50 (1 unit) — capped down to the R40 maximum.
  assert.equal(commissionData.commissionAmount.toString(), "40");

  const rows = stubs.productCommissionCreateMany.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(rows[0].commissionType, "FIXED_AMOUNT");
  assert.equal(rows[0].fixedCommissionAmount.toString(), "50");
  assert.equal(rows[0].commissionPercent, null);
  assert.equal(rows[0].calculatedCommission.toString(), "40");

  stubs.restore();
});

test("isAffiliateAvailable:false excludes a product from commission entirely, while the customer discount is unaffected", async () => {
  const stubs = stubReferralOrderCreation(affiliateRow(), [{ ...ELIGIBLE_PRODUCT_SETTING_ROW, isAffiliateAvailable: false }]);
  const referralAttribution = signReferralCapture("alice-1");

  const order = await createOrder(referralInput(referralAttribution));

  assert.equal(order.discountTotal, 25);
  const commissionData = stubs.commissionCreate.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(commissionData.commissionAmount.toString(), "0");
  assert.equal(stubs.productCommissionCreateMany.fn.mock.callCount(), 0);

  stubs.restore();
});
