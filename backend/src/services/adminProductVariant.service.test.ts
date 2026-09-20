// Milestone 188: dedicated backend tests for adminProductVariant.service.ts
// — the admin write path for ProductVariant rows (Generate Variations,
// manual create, update, remove). Same stub() helper pattern as
// adminProduct.service.test.ts/order.service.test.ts (Prisma's Proxy
// model delegates can't be spied on directly).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { generateVariations, createVariant, updateVariant, removeVariant } from "./adminProductVariant.service.js";
import { AdminProductError } from "./adminProduct.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

// The full row shape adminProduct.service.ts's toAdminProductDetail()
// reads — same fixture shape as adminProduct.service.test.ts's own
// productRow(), extended with a `variants` array.
function fullProductRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    name: "Rotating Crayons",
    slug: "rotating-crayons",
    sku: "RC-1",
    shortDescription: null,
    description: null,
    price: new Prisma.Decimal("100.00"),
    oldPrice: null,
    stockQuantity: 0,
    lowStockThreshold: 5,
    status: "ACTIVE",
    categoryId: "cat-1",
    category: { id: "cat-1", name: "Markers and Crayons", slug: "markers-and-crayons" },
    ageRange: null,
    features: null,
    discountLabel: null,
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    images: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    productType: "PHYSICAL",
    digitalTermsNote: null,
    downloadEnabled: true,
    isPreorderEnabled: false,
    preorderStartAt: null,
    preorderEndAt: null,
    preorderReleaseAt: null,
    isPreorderDiscountEligible: false,
    hasVariants: true,
    variantOptions: [{ name: "Pack Size", values: ["10 Colours", "20 Colours"] }],
    variants: [],
    ...overrides,
  };
}

const PARTIAL_ROW = {
  id: "product-1",
  sku: "RC-1",
  price: new Prisma.Decimal("100.00"),
  hasVariants: true,
  variantOptions: [{ name: "Pack Size", values: ["10 Colours", "20 Colours"] }],
  stockQuantity: 0,
  images: [] as { url: string }[],
};

// Routes prisma.product.findUnique to the right stubbed shape depending
// on which of loadVariableProduct()'s `select`, assertSkuAvailable()'s
// `where: { sku }`, or getProductForAdmin()'s `include` called it —
// three genuinely different call sites in the real code that all hit
// this one Prisma method.
function stubProductFindUnique({ partial = PARTIAL_ROW, full = fullProductRow(), existingSkuOwner = null }: { partial?: Record<string, unknown>; full?: Record<string, unknown>; existingSkuOwner?: { id: string } | null } = {}) {
  return stub(prisma.product, "findUnique", async (args: { where?: { sku?: string; id?: string }; select?: unknown; include?: unknown }) => {
    if (args.where?.sku !== undefined) return existingSkuOwner;
    if (args.select) return partial;
    return full;
  });
}

test("generateVariations: rejects a product that does not have variations enabled", async () => {
  const findUnique = stubProductFindUnique({ partial: { ...PARTIAL_ROW, hasVariants: false } });

  await assert.rejects(
    () => generateVariations("product-1", {}),
    (error: unknown) => error instanceof AdminProductError && /does not have variations/i.test(error.message)
  );

  findUnique.restore();
});

test("generateVariations: rejects a variable product with no option groups defined yet", async () => {
  const findUnique = stubProductFindUnique({ partial: { ...PARTIAL_ROW, variantOptions: [] } });

  await assert.rejects(
    () => generateVariations("product-1", {}),
    (error: unknown) => error instanceof AdminProductError && /no option groups/i.test(error.message)
  );

  findUnique.restore();
});

test("generateVariations: creates every combination the product doesn't already have one for, and never touches an existing row", async () => {
  const findUnique = stubProductFindUnique();
  const findMany = stub(prisma.productVariant, "findMany", async () => [
    { optionValues: { "Pack Size": "10 Colours" }, sortOrder: 0 },
  ]);
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => ops);
  const create = stub(prisma.productVariant, "create", async ({ data }: { data: Record<string, unknown> }) => data);

  const result = await generateVariations("product-1", {});

  // "10 Colours" already exists — only "20 Colours" is genuinely new.
  assert.equal(result.created, 1);
  assert.equal(create.fn.mock.callCount(), 1);
  const createdData = create.fn.mock.calls[0]!.arguments[0].data;
  assert.deepEqual(createdData.optionValues, { "Pack Size": "20 Colours" });
  assert.equal(createdData.sortOrder, 1);

  findUnique.restore();
  findMany.restore();
  transactionStub.restore();
  create.restore();
});

test("generateVariations: re-running after every combination already exists creates nothing, and never calls the transaction at all", async () => {
  const findUnique = stubProductFindUnique();
  const findMany = stub(prisma.productVariant, "findMany", async () => [
    { optionValues: { "Pack Size": "10 Colours" }, sortOrder: 0 },
    { optionValues: { "Pack Size": "20 Colours" }, sortOrder: 1 },
  ]);
  const transactionStub = stub(prisma, "$transaction", async () => {
    throw new Error("must never be called — every combination already has a row");
  });

  const result = await generateVariations("product-1", {});
  assert.equal(result.created, 0);

  findUnique.restore();
  findMany.restore();
  transactionStub.restore();
});

test("generateVariations: a two-group product creates the full cartesian product of missing combinations", async () => {
  const twoGroupPartial = {
    ...PARTIAL_ROW,
    variantOptions: [
      { name: "Pack Size", values: ["10 Colours", "20 Colours"] },
      { name: "Finish", values: ["Matte", "Glossy"] },
    ],
  };
  const findUnique = stubProductFindUnique({ partial: twoGroupPartial });
  const findMany = stub(prisma.productVariant, "findMany", async () => []);
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => ops);
  const create = stub(prisma.productVariant, "create", async ({ data }: { data: Record<string, unknown> }) => data);

  const result = await generateVariations("product-1", {});

  assert.equal(result.created, 4);
  assert.equal(create.fn.mock.callCount(), 4);

  findUnique.restore();
  findMany.restore();
  transactionStub.restore();
  create.restore();
});

test("createVariant: rejects optionValues that don't match the product's own defined option groups", async () => {
  const findUnique = stubProductFindUnique();

  await assert.rejects(
    () => createVariant("product-1", { optionValues: { "Pack Size": "50 Colours" }, price: 100 }),
    (error: unknown) => error instanceof AdminProductError && /missing a valid value/i.test(error.message)
  );

  findUnique.restore();
});

test("createVariant: rejects a duplicate of an existing combination", async () => {
  const findUnique = stubProductFindUnique();
  const findMany = stub(prisma.productVariant, "findMany", async () => [{ optionValues: { "Pack Size": "10 Colours" }, sortOrder: 0 }]);

  await assert.rejects(
    () => createVariant("product-1", { optionValues: { "Pack Size": "10 Colours" }, price: 100 }),
    (error: unknown) => error instanceof AdminProductError && /already exists/i.test(error.message)
  );

  findUnique.restore();
  findMany.restore();
});

test("createVariant: rejects a SKU already used by a DIFFERENT PRODUCT's own sku column — cross-table uniqueness", async () => {
  const findUnique = stubProductFindUnique({ existingSkuOwner: { id: "some-other-product" } });

  await assert.rejects(
    () => createVariant("product-1", { optionValues: { "Pack Size": "10 Colours" }, price: 100, sku: "TAKEN-SKU" }),
    (error: unknown) => error instanceof AdminProductError && /SKU already in use/i.test(error.message)
  );

  findUnique.restore();
});

test("createVariant: rejects a SKU already used by ANOTHER VARIANT — cross-table uniqueness the other direction", async () => {
  const findUnique = stubProductFindUnique();
  const variantFindFirst = stub(prisma.productVariant, "findFirst", async () => ({ id: "other-variant" }));

  await assert.rejects(
    () => createVariant("product-1", { optionValues: { "Pack Size": "10 Colours" }, price: 100, sku: "TAKEN-SKU" }),
    (error: unknown) => error instanceof AdminProductError && /SKU already in use/i.test(error.message)
  );

  findUnique.restore();
  variantFindFirst.restore();
});

test("updateVariant: rejects a variantId that belongs to a DIFFERENT product — never editable cross-product", async () => {
  const variantFindUnique = stub(prisma.productVariant, "findUnique", async () => ({ id: "variant-1", productId: "some-other-product" }));

  await assert.rejects(
    () => updateVariant("product-1", "variant-1", { price: 120 }),
    (error: unknown) => error instanceof AdminProductError && error.statusCode === 404
  );

  variantFindUnique.restore();
});

test("updateVariant: rejects any field outside the explicit allow-list", async () => {
  const variantFindUnique = stub(prisma.productVariant, "findUnique", async () => ({ id: "variant-1", productId: "product-1" }));

  await assert.rejects(
    () => updateVariant("product-1", "variant-1", { optionValues: { "Pack Size": "30 Colours" } }),
    (error: unknown) => error instanceof AdminProductError && /cannot be edited/i.test(error.message)
  );

  variantFindUnique.restore();
});

test("updateVariant: a valid price/stock update writes only those fields and returns the refreshed product", async () => {
  const variantFindUnique = stub(prisma.productVariant, "findUnique", async () => ({ id: "variant-1", productId: "product-1" }));
  const update = stub(prisma.productVariant, "update", async ({ data }: { data: Record<string, unknown> }) => data);
  const findUnique = stubProductFindUnique();

  const product = await updateVariant("product-1", "variant-1", { price: 199.99, stockQuantity: 5 });

  assert.equal(update.fn.mock.callCount(), 1);
  const writtenData = update.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(writtenData.price, 199.99);
  assert.equal(writtenData.stockQuantity, 5);
  assert.equal(Object.keys(writtenData).length, 2);
  assert.equal(product.id, "product-1");

  variantFindUnique.restore();
  update.restore();
  findUnique.restore();
});

test("removeVariant: hard-deletes a variant that has never been ordered", async () => {
  const variantFindUnique = stub(prisma.productVariant, "findUnique", async () => ({ id: "variant-1", productId: "product-1" }));
  const orderItemFindFirst = stub(prisma.orderItem, "findFirst", async () => null);
  const deleteFn = stub(prisma.productVariant, "delete", async () => ({}));
  const updateFn = stub(prisma.productVariant, "update", async () => {
    throw new Error("must never deactivate a variant with no orders — it should be hard-deleted instead");
  });
  const findUnique = stubProductFindUnique();

  await removeVariant("product-1", "variant-1");

  assert.equal(deleteFn.fn.mock.callCount(), 1);
  assert.equal(updateFn.fn.mock.callCount(), 0);

  variantFindUnique.restore();
  orderItemFindFirst.restore();
  deleteFn.restore();
  updateFn.restore();
  findUnique.restore();
});

test("removeVariant: NEVER hard-deletes a variant already referenced by an order — deactivates it instead", async () => {
  const variantFindUnique = stub(prisma.productVariant, "findUnique", async () => ({ id: "variant-1", productId: "product-1" }));
  const orderItemFindFirst = stub(prisma.orderItem, "findFirst", async () => ({ id: "order-item-1" }));
  const deleteFn = stub(prisma.productVariant, "delete", async () => {
    throw new Error("must never hard-delete a variant referenced by an order");
  });
  const updateFn = stub(prisma.productVariant, "update", async ({ data }: { data: Record<string, unknown> }) => data);
  const findUnique = stubProductFindUnique();

  await removeVariant("product-1", "variant-1");

  assert.equal(deleteFn.fn.mock.callCount(), 0);
  assert.equal(updateFn.fn.mock.callCount(), 1);
  assert.equal(updateFn.fn.mock.calls[0]!.arguments[0].data.isActive, false);

  variantFindUnique.restore();
  orderItemFindFirst.restore();
  deleteFn.restore();
  updateFn.restore();
  findUnique.restore();
});

// ---------------------------------------------------------------------------
// Milestone 188A: book language edition support.
// ---------------------------------------------------------------------------

const LANGUAGE_PARTIAL_ROW = {
  ...PARTIAL_ROW,
  variantOptions: [{ name: "Language", values: ["English", "Tshivenda", "Sepedi"] }],
};

test("generateVariations: auto-derives languageCode from a known South African language label", async () => {
  const findUnique = stubProductFindUnique({ partial: LANGUAGE_PARTIAL_ROW });
  const findMany = stub(prisma.productVariant, "findMany", async () => []);
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => ops);
  const create = stub(prisma.productVariant, "create", async ({ data }: { data: Record<string, unknown> }) => data);

  await generateVariations("product-1", {});

  const createdRows = create.fn.mock.calls.map((call) => call.arguments[0].data);
  const tshivenda = createdRows.find((row: Record<string, unknown>) => (row.optionValues as Record<string, string>)["Language"] === "Tshivenda");
  const sepedi = createdRows.find((row: Record<string, unknown>) => (row.optionValues as Record<string, string>)["Language"] === "Sepedi");
  assert.equal(tshivenda.languageCode, "ve");
  // Sepedi has no ISO 639-1 code — "nso" is its ISO 639-2 code.
  assert.equal(sepedi.languageCode, "nso");

  findUnique.restore();
  findMany.restore();
  transactionStub.restore();
  create.restore();
});

test("generateVariations: a custom/unrecognised language value gets languageCode: null, never a guessed code", async () => {
  const customLanguagePartial = { ...PARTIAL_ROW, variantOptions: [{ name: "Language", values: ["Klingon"] }] };
  const findUnique = stubProductFindUnique({ partial: customLanguagePartial });
  const findMany = stub(prisma.productVariant, "findMany", async () => []);
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => ops);
  const create = stub(prisma.productVariant, "create", async ({ data }: { data: Record<string, unknown> }) => data);

  await generateVariations("product-1", {});

  const createdRow = create.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(createdRow.languageCode, null);

  findUnique.restore();
  findMany.restore();
  transactionStub.restore();
  create.restore();
});

test("generateVariations: on the very first generation, the sole 'English' combination is prefilled from the product's own price/stock/sku/cover image", async () => {
  const partialWithParentData = {
    ...LANGUAGE_PARTIAL_ROW,
    sku: "NT-BOOK-1",
    price: new Prisma.Decimal("199.99"),
    stockQuantity: 42,
    images: [{ url: "https://example.supabase.co/cover.png" }],
  };
  const findUnique = stubProductFindUnique({ partial: partialWithParentData });
  const findMany = stub(prisma.productVariant, "findMany", async () => []);
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => ops);
  const create = stub(prisma.productVariant, "create", async ({ data }: { data: Record<string, unknown> }) => data);

  await generateVariations("product-1", { defaultPrice: 50, defaultStockQuantity: 0 });

  const createdRows = create.fn.mock.calls.map((call) => call.arguments[0].data);
  const english = createdRows.find((row: Record<string, unknown>) => (row.optionValues as Record<string, string>)["Language"] === "English");
  const tshivenda = createdRows.find((row: Record<string, unknown>) => (row.optionValues as Record<string, string>)["Language"] === "Tshivenda");

  assert.equal(english.price.toString(), "199.99");
  assert.equal(english.stockQuantity, 42);
  assert.equal(english.sku, "NT-BOOK-1");
  assert.equal(english.imageUrl, "https://example.supabase.co/cover.png");

  // Every OTHER combination still gets the generic defaults, never the
  // parent's own price/sku/image (which would collide on sku anyway).
  assert.equal(tshivenda.price.toString(), "50");
  assert.equal(tshivenda.stockQuantity, 0);
  assert.equal(tshivenda.sku, null);
  assert.equal(tshivenda.imageUrl, null);

  findUnique.restore();
  findMany.restore();
  transactionStub.restore();
  create.restore();
});

test("generateVariations: never prefills English when re-run after variants already exist — a later Generate Variations call must never touch old data", async () => {
  const findUnique = stubProductFindUnique({ partial: LANGUAGE_PARTIAL_ROW });
  const findMany = stub(prisma.productVariant, "findMany", async () => [{ optionValues: { Language: "English" }, sortOrder: 0 }]);
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => ops);
  const create = stub(prisma.productVariant, "create", async ({ data }: { data: Record<string, unknown> }) => data);

  await generateVariations("product-1", {});

  const createdRows = create.fn.mock.calls.map((call) => call.arguments[0].data);
  // English already existed, so only Tshivenda/Sepedi are genuinely new — neither is prefilled from the parent.
  assert.equal(createdRows.length, 2);
  for (const row of createdRows) {
    assert.equal(row.sku, null);
  }

  findUnique.restore();
  findMany.restore();
  transactionStub.restore();
  create.restore();
});

test("generateVariations: a multi-group product's several 'English' combinations are never SKU-prefilled (would collide) — falls back to generic defaults for safety", async () => {
  const multiGroupPartial = {
    ...PARTIAL_ROW,
    sku: "NT-BOOK-1",
    variantOptions: [
      { name: "Language", values: ["English", "Tshivenda"] },
      { name: "Format", values: ["Paperback", "Digital"] },
    ],
  };
  const findUnique = stubProductFindUnique({ partial: multiGroupPartial });
  const findMany = stub(prisma.productVariant, "findMany", async () => []);
  const transactionStub = stub(prisma, "$transaction", async (ops: unknown[]) => ops);
  const create = stub(prisma.productVariant, "create", async ({ data }: { data: Record<string, unknown> }) => data);

  await generateVariations("product-1", {});

  const createdRows = create.fn.mock.calls.map((call) => call.arguments[0].data);
  const englishRows = createdRows.filter((row: Record<string, unknown>) => (row.optionValues as Record<string, string>)["Language"] === "English");
  assert.equal(englishRows.length, 2);
  // Neither English combination gets the parent's own sku — creating both would violate the unique sku constraint.
  for (const row of englishRows) {
    assert.equal(row.sku, null);
  }

  findUnique.restore();
  findMany.restore();
  transactionStub.restore();
  create.restore();
});

test("createVariant: accepts a valid ISBN and GTIN, normalised to digits-only", async () => {
  const findUnique = stubProductFindUnique({ partial: LANGUAGE_PARTIAL_ROW });
  const findMany = stub(prisma.productVariant, "findMany", async () => []);
  const create = stub(prisma.productVariant, "create", async ({ data }: { data: Record<string, unknown> }) => data);

  await createVariant("product-1", { optionValues: { Language: "Tshivenda" }, price: 150, isbn: "978-0-306-40615-7", gtin: "4006381333931" });

  const createdData = create.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(createdData.isbn, "9780306406157");
  assert.equal(createdData.gtin, "4006381333931");
  assert.equal(createdData.languageCode, "ve");

  findUnique.restore();
  findMany.restore();
  create.restore();
});

test("createVariant: rejects an ISBN with an invalid check digit — never silently stores a typo", async () => {
  const findUnique = stubProductFindUnique({ partial: LANGUAGE_PARTIAL_ROW });

  await assert.rejects(
    () => createVariant("product-1", { optionValues: { Language: "Tshivenda" }, price: 150, isbn: "9780306406150" }),
    (error: unknown) => error instanceof AdminProductError && /check digit/i.test(error.message)
  );

  findUnique.restore();
});

test("updateVariant: accepts and normalises a valid ISBN update", async () => {
  const variantFindUnique = stub(prisma.productVariant, "findUnique", async () => ({ id: "variant-1", productId: "product-1" }));
  const update = stub(prisma.productVariant, "update", async ({ data }: { data: Record<string, unknown> }) => data);
  const findUnique = stubProductFindUnique();

  await updateVariant("product-1", "variant-1", { isbn: "978-0-306-40615-7" });

  const writtenData = update.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(writtenData.isbn, "9780306406157");

  variantFindUnique.restore();
  update.restore();
  findUnique.restore();
});
