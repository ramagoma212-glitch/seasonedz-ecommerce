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
import { createOrder, OrderError } from "./order.service.js";
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
