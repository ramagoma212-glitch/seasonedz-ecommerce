// Milestone 178, Part C: admin CRUD for AffiliateProductSetting.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  AffiliateProductSettingError,
  createAffiliateProductSetting,
  deleteAffiliateProductSetting,
  listAffiliateProductSettings,
  updateAffiliateProductSetting,
} from "./adminAffiliateProductSetting.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const PRODUCT_ROW = { id: "product-1", name: "Test Colouring Book", slug: "test-colouring-book", sku: "TCB-1", price: new Prisma.Decimal("199.00"), status: "ACTIVE", images: [{ url: "https://example.invalid/a.webp", isPrimary: false }, { url: "https://example.invalid/b.webp", isPrimary: true }] };

const SETTING_ROW = {
  id: "setting-1",
  productId: "product-1",
  commissionType: "PERCENTAGE" as const,
  commissionPercent: new Prisma.Decimal("10.00"),
  fixedCommissionAmount: null,
  isAffiliateAvailable: true,
  startsAt: null,
  endsAt: null,
  maximumCommission: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  product: PRODUCT_ROW,
};

test("listAffiliateProductSettings: reads the primary product image, live name/price/sku/status — never a copy", async () => {
  const count = stub(prisma.affiliateProductSetting, "count", async () => 1);
  const findMany = stub(prisma.affiliateProductSetting, "findMany", async () => [SETTING_ROW]);

  const result = await listAffiliateProductSettings({ page: 1, limit: 20 });
  assert.equal(result.items.length, 1);
  const item = result.items[0]!;
  assert.equal(item.productName, "Test Colouring Book");
  assert.equal(item.productPrice, 199);
  assert.equal(item.productSku, "TCB-1");
  assert.equal(item.productStatus, "ACTIVE");
  assert.equal(item.productImageUrl, "https://example.invalid/b.webp", "the isPrimary image, not just the first one");
  assert.equal(item.commissionPercent, 10);

  count.restore();
  findMany.restore();
});

test("createAffiliateProductSetting: rejects when the product does not exist", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => null);

  await assert.rejects(
    () => createAffiliateProductSetting("missing-product", { commissionType: "PERCENTAGE", commissionPercent: 10, fixedCommissionAmount: null, isAffiliateAvailable: true, startsAt: null, endsAt: null, maximumCommission: null }),
    (error: unknown) => error instanceof AffiliateProductSettingError && error.statusCode === 404
  );

  productFind.restore();
});

test("createAffiliateProductSetting: rejects a duplicate — a product already in the Affiliate Products list (defense in depth alongside the DB's own unique constraint)", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const existingFind = stub(prisma.affiliateProductSetting, "findUnique", async () => SETTING_ROW);

  await assert.rejects(
    () => createAffiliateProductSetting("product-1", { commissionType: "PERCENTAGE", commissionPercent: 10, fixedCommissionAmount: null, isAffiliateAvailable: true, startsAt: null, endsAt: null, maximumCommission: null }),
    (error: unknown) => error instanceof AffiliateProductSettingError && error.statusCode === 409
  );

  productFind.restore();
  existingFind.restore();
});

test("createAffiliateProductSetting: PERCENTAGE with fixedCommissionAmount also set is rejected — the two commission types are mutually exclusive", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const existingFind = stub(prisma.affiliateProductSetting, "findUnique", async () => null);

  await assert.rejects(
    () => createAffiliateProductSetting("product-1", { commissionType: "PERCENTAGE", commissionPercent: 10, fixedCommissionAmount: 5, isAffiliateAvailable: true, startsAt: null, endsAt: null, maximumCommission: null }),
    AffiliateProductSettingError
  );

  productFind.restore();
  existingFind.restore();
});

test("createAffiliateProductSetting: FIXED_AMOUNT requires fixedCommissionAmount", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const existingFind = stub(prisma.affiliateProductSetting, "findUnique", async () => null);

  await assert.rejects(
    () => createAffiliateProductSetting("product-1", { commissionType: "FIXED_AMOUNT", commissionPercent: null, fixedCommissionAmount: null, isAffiliateAvailable: true, startsAt: null, endsAt: null, maximumCommission: null }),
    AffiliateProductSettingError
  );

  productFind.restore();
  existingFind.restore();
});

test("createAffiliateProductSetting: startsAt after endsAt is rejected", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const existingFind = stub(prisma.affiliateProductSetting, "findUnique", async () => null);

  await assert.rejects(
    () =>
      createAffiliateProductSetting("product-1", {
        commissionType: "PERCENTAGE",
        commissionPercent: 10,
        fixedCommissionAmount: null,
        isAffiliateAvailable: true,
        startsAt: "2026-12-01",
        endsAt: "2026-01-01",
        maximumCommission: null,
      }),
    AffiliateProductSettingError
  );

  productFind.restore();
  existingFind.restore();
});

test("createAffiliateProductSetting: a valid PERCENTAGE input creates the row with the given productId", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const existingFind = stub(prisma.affiliateProductSetting, "findUnique", async () => null);
  const create = stub(prisma.affiliateProductSetting, "create", mock.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...SETTING_ROW, ...data })));

  const result = await createAffiliateProductSetting("product-1", {
    commissionType: "PERCENTAGE",
    commissionPercent: 12,
    fixedCommissionAmount: null,
    isAffiliateAvailable: true,
    startsAt: null,
    endsAt: null,
    maximumCommission: null,
  });

  assert.equal(result.productId, "product-1");
  assert.equal(create.fn.mock.callCount(), 1);
  assert.equal(create.fn.mock.calls[0]!.arguments[0].data.productId, "product-1");

  productFind.restore();
  existingFind.restore();
  create.restore();
});

test("updateAffiliateProductSetting: never touches Product's own name/price/image/SKU/stock — only ever writes to AffiliateProductSetting", async () => {
  const existingFind = stub(prisma.affiliateProductSetting, "findUnique", async () => SETTING_ROW);
  const productUpdate = stub(prisma.product, "update", mock.fn(async () => {
    throw new Error("must never be called — editing affiliate commission settings must never touch the Product row itself");
  }));
  const update = stub(prisma.affiliateProductSetting, "update", async ({ data }: { data: Record<string, unknown> }) => ({ ...SETTING_ROW, ...data }));

  await updateAffiliateProductSetting("setting-1", {
    commissionType: "PERCENTAGE",
    commissionPercent: 20,
    fixedCommissionAmount: null,
    isAffiliateAvailable: false,
    startsAt: null,
    endsAt: null,
    maximumCommission: null,
  });

  assert.equal(productUpdate.fn.mock.callCount(), 0);

  existingFind.restore();
  productUpdate.restore();
  update.restore();
});

test("deleteAffiliateProductSetting: 404s for an unknown id, never silently succeeds", async () => {
  const existingFind = stub(prisma.affiliateProductSetting, "findUnique", async () => null);

  await assert.rejects(() => deleteAffiliateProductSetting("missing"), (error: unknown) => error instanceof AffiliateProductSettingError && error.statusCode === 404);

  existingFind.restore();
});

test("deleteAffiliateProductSetting: a real row is hard-deleted (safe — no FK from historical commissions, see the model's own schema comment)", async () => {
  const existingFind = stub(prisma.affiliateProductSetting, "findUnique", async () => SETTING_ROW);
  const del = stub(prisma.affiliateProductSetting, "delete", mock.fn(async () => SETTING_ROW));

  await deleteAffiliateProductSetting("setting-1");
  assert.equal(del.fn.mock.callCount(), 1);

  existingFind.restore();
  del.restore();
});
