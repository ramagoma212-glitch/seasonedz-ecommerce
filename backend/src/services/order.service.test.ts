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
