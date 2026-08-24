// Version 7, Milestone 172B: backend tests for admin affiliate-product
// management. Same stub() pattern as productReview.service.test.ts —
// Prisma's model-delegate methods are monkeypatched directly, so
// nothing here ever touches the real (production) database.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import {
  AdminAffiliateProductError,
  createAffiliateProduct,
  updateAffiliateProduct,
  setAffiliateProductActive,
  setAffiliateProductFeatured,
  createAffiliateCommission,
} from "./adminAffiliateProduct.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const BASE_ROW = {
  id: "aff-1",
  title: "The Very Hungry Caterpillar",
  author: "Eric Carle",
  slug: "the-very-hungry-caterpillar",
  trackingSlug: "very-hungry-caterpillar",
  description: null,
  imageUrl: null,
  category: null,
  merchantName: "Amazon",
  affiliateNetwork: "Amazon Associates",
  affiliateUrl: "https://www.amazon.co.za/dp/B0073X8Y5U",
  price: null,
  currency: "ZAR",
  priceLastCheckedAt: null,
  discountText: null,
  rating: null,
  isFeatured: false,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function validCreateInput(overrides: Record<string, unknown> = {}) {
  return {
    title: "The Very Hungry Caterpillar",
    merchantName: "Amazon",
    affiliateUrl: "https://www.amazon.co.za/dp/B0073X8Y5U",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createAffiliateProduct
// ---------------------------------------------------------------------------

test("create: missing title is rejected", async () => {
  await assert.rejects(
    () => createAffiliateProduct({ merchantName: "Amazon", affiliateUrl: "https://example.com/book" }),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );
});

test("create: missing merchant is rejected", async () => {
  await assert.rejects(
    () => createAffiliateProduct({ title: "A Book", affiliateUrl: "https://example.com/book" }),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );
});

test("create: invalid affiliate URL (http, not https) is rejected", async () => {
  await assert.rejects(
    () => createAffiliateProduct(validCreateInput({ affiliateUrl: "http://example.com/book" })),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );
});

test("create: javascript: affiliate URL is rejected", async () => {
  await assert.rejects(
    () => createAffiliateProduct(validCreateInput({ affiliateUrl: "javascript:alert(1)" })),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );
});

test("create: negative price is rejected", async () => {
  await assert.rejects(
    () => createAffiliateProduct(validCreateInput({ price: -10 })),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );
});

test("create: rating outside 0-5 is rejected", async () => {
  await assert.rejects(
    () => createAffiliateProduct(validCreateInput({ rating: 7 })),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );
  await assert.rejects(
    () => createAffiliateProduct(validCreateInput({ rating: -1 })),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );
});

test("create: explicit duplicate slug is rejected with a 409", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async (args: { where: { slug?: string; trackingSlug?: string } }) => {
    if (args.where.slug) return { id: "existing" };
    return null;
  });

  await assert.rejects(
    () => createAffiliateProduct(validCreateInput({ slug: "already-taken" })),
    (error: unknown) => error instanceof AdminAffiliateProductError && error.statusCode === 409
  );

  findUnique.restore();
});

test("create: explicit duplicate trackingSlug is rejected with a 409", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async (args: { where: { slug?: string; trackingSlug?: string } }) => {
    if (args.where.trackingSlug) return { id: "existing" };
    return null;
  });

  await assert.rejects(
    () => createAffiliateProduct(validCreateInput({ trackingSlug: "already-taken" })),
    (error: unknown) => error instanceof AdminAffiliateProductError && error.statusCode === 409
  );

  findUnique.restore();
});

test("create: a valid submission generates a slug and trackingSlug and persists a normalised https URL", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async () => null);
  let createArgs: unknown;
  const create = stub(prisma.affiliateProduct, "create", async (args: { data: Record<string, unknown> }) => {
    createArgs = args.data;
    return { ...BASE_ROW, ...args.data };
  });

  const result = await createAffiliateProduct(validCreateInput());

  assert.equal(result.title, "The Very Hungry Caterpillar");
  assert.equal((createArgs as Record<string, unknown>).slug, "the-very-hungry-caterpillar");
  assert.equal((createArgs as Record<string, unknown>).trackingSlug, "the-very-hungry-caterpillar");
  assert.equal((createArgs as Record<string, unknown>).affiliateUrl, "https://www.amazon.co.za/dp/B0073X8Y5U");

  findUnique.restore();
  create.restore();
});

test("create: setting a price without priceLastCheckedAt defaults priceLastCheckedAt to now — never a misleadingly stale claim", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async () => null);
  let createArgs: Record<string, unknown> = {};
  const create = stub(prisma.affiliateProduct, "create", async (args: { data: Record<string, unknown> }) => {
    createArgs = args.data;
    // Real Prisma returns Decimal instances for Decimal columns — this
    // stub mirrors that shape (see toOutput()'s own row.price.toNumber()
    // call) rather than echoing back the plain number the service wrote.
    const price = args.data.price;
    return { ...BASE_ROW, ...args.data, price: price === null || price === undefined ? null : { toNumber: () => price } };
  });

  const before = Date.now();
  await createAffiliateProduct(validCreateInput({ price: 150 }));
  const after = Date.now();

  const checkedAt = createArgs.priceLastCheckedAt as Date;
  assert.ok(checkedAt instanceof Date);
  assert.ok(checkedAt.getTime() >= before && checkedAt.getTime() <= after);

  findUnique.restore();
  create.restore();
});

// ---------------------------------------------------------------------------
// updateAffiliateProduct
// ---------------------------------------------------------------------------

test("update: 404 when the affiliate product does not exist", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async () => null);

  await assert.rejects(
    () => updateAffiliateProduct("missing-id", { title: "New Title" }),
    (error: unknown) => error instanceof AdminAffiliateProductError && error.statusCode === 404
  );

  findUnique.restore();
});

test("update: an unrecognised field is rejected, never silently applied", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async () => ({ id: "aff-1", price: null }));

  await assert.rejects(
    () => updateAffiliateProduct("aff-1", { commissionRate: 0.1 }),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );

  findUnique.restore();
});

test("update: trackingSlug is never touched by an unrelated edit — only present in the write when explicitly submitted", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async () => ({ id: "aff-1", price: null }));
  let updateArgs: Record<string, unknown> = {};
  const update = stub(prisma.affiliateProduct, "update", async (args: { data: Record<string, unknown> }) => {
    updateArgs = args.data;
    return { ...BASE_ROW, ...args.data };
  });

  await updateAffiliateProduct("aff-1", { isFeatured: true });

  assert.ok(!("trackingSlug" in updateArgs));
  assert.equal(updateArgs.isFeatured, true);

  findUnique.restore();
  update.restore();
});

test("update: clearing price also clears priceLastCheckedAt", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async () => ({ id: "aff-1", price: 150 }));
  let updateArgs: Record<string, unknown> = {};
  const update = stub(prisma.affiliateProduct, "update", async (args: { data: Record<string, unknown> }) => {
    updateArgs = args.data;
    return { ...BASE_ROW, ...args.data };
  });

  await updateAffiliateProduct("aff-1", { price: null });

  assert.equal(updateArgs.price, null);
  assert.equal(updateArgs.priceLastCheckedAt, null);

  findUnique.restore();
  update.restore();
});

test("update: invalid affiliate URL is rejected", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async () => ({ id: "aff-1", price: null }));

  await assert.rejects(
    () => updateAffiliateProduct("aff-1", { affiliateUrl: "javascript:alert(1)" }),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );

  findUnique.restore();
});

// ---------------------------------------------------------------------------
// activate / deactivate / feature / unfeature — isActive=false is the
// only removal path; no hard-delete function exists in this service.
// ---------------------------------------------------------------------------

test("deactivate sets isActive=false via the ordinary update path (no hard delete anywhere in this service)", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async () => ({ id: "aff-1", price: null }));
  let updateArgs: Record<string, unknown> = {};
  const update = stub(prisma.affiliateProduct, "update", async (args: { data: Record<string, unknown> }) => {
    updateArgs = args.data;
    return { ...BASE_ROW, ...args.data, isActive: false };
  });

  const result = await setAffiliateProductActive("aff-1", false);

  assert.equal(updateArgs.isActive, false);
  assert.equal(result.isActive, false);

  findUnique.restore();
  update.restore();
});

test("feature/unfeature only ever touches isFeatured", async () => {
  const findUnique = stub(prisma.affiliateProduct, "findUnique", async () => ({ id: "aff-1", price: null }));
  let updateArgs: Record<string, unknown> = {};
  const update = stub(prisma.affiliateProduct, "update", async (args: { data: Record<string, unknown> }) => {
    updateArgs = args.data;
    return { ...BASE_ROW, ...args.data };
  });

  await setAffiliateProductFeatured("aff-1", true);

  assert.deepEqual(Object.keys(updateArgs), ["isFeatured"]);
  assert.equal(updateArgs.isFeatured, true);

  findUnique.restore();
  update.restore();
});

// ---------------------------------------------------------------------------
// Commission: manual entry only — never derived from AffiliateClick.
// ---------------------------------------------------------------------------

test("commission creation never reads AffiliateClick — a click is never treated as a sale", async () => {
  const clickFindMany = stub(prisma.affiliateClick, "findMany", async () => {
    throw new Error("AffiliateClick must never be queried when recording a manual commission.");
  });
  const create = stub(prisma.affiliateCommission, "create", async (args: { data: Record<string, unknown> }) => ({
    id: "comm-1",
    affiliateProductId: null,
    productTitleSnapshot: args.data.productTitleSnapshot,
    affiliateNetwork: null,
    externalReference: null,
    saleDate: new Date(),
    saleAmount: { toNumber: () => 100 },
    commissionRate: null,
    commissionEarned: { toNumber: () => 10 },
    currency: "ZAR",
    status: "PENDING",
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const result = await createAffiliateCommission({
    productTitleSnapshot: "A Book Sold Elsewhere",
    saleDate: new Date().toISOString(),
    saleAmount: 100,
    commissionEarned: 10,
  });

  assert.equal(result.productTitleSnapshot, "A Book Sold Elsewhere");
  assert.equal(result.status, "PENDING");
  assert.equal(clickFindMany.fn.mock.callCount(), 0);

  clickFindMany.restore();
  create.restore();
});

test("commission creation requires either a real affiliateProductId or a manual productTitleSnapshot", async () => {
  await assert.rejects(
    () => createAffiliateCommission({ saleDate: new Date().toISOString(), saleAmount: 100, commissionEarned: 10 }),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );
});

test("commission creation rejects a negative saleAmount", async () => {
  await assert.rejects(
    () =>
      createAffiliateCommission({
        productTitleSnapshot: "A Book",
        saleDate: new Date().toISOString(),
        saleAmount: -5,
        commissionEarned: 10,
      }),
    (error: unknown) => error instanceof AdminAffiliateProductError
  );
});
