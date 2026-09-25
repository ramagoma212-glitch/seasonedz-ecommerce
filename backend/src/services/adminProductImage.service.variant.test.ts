// Milestone 197: dedicated backend tests for adminProductImage.service.ts's
// variant-scoped functions (uploadImageForVariant/updateVariantImage/
// deleteVariantImage/listVariantImages) — the new per-variant image
// pipeline. Same stub() helper pattern as adminProductVariant.service.
// test.ts (Prisma's Proxy model delegates can't be spied on directly).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import {
  AdminProductImageError,
  listVariantImages,
  uploadImageForVariant,
  updateVariantImage,
  deleteVariantImage,
} from "./adminProductImage.service.js";

// Milestone 197: uploadImageForVariant's real Supabase Storage call
// (supabaseStorage.service.ts) is deliberately never stubbed here —
// under native ESM, an imported module's named exports are read-only
// bindings that cannot be reassigned from a test file (unlike `prisma`,
// a genuinely mutable object), which is exactly why no existing test
// file for adminProductImage.service.ts stubs that module either. Tests
// below stick to the same convention: only ever exercise a code path
// whose one impure dependency is `prisma`.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const VARIANT_ON_PRODUCT_1 = { id: "variant-1", productId: "product-1", optionValues: { "Pack Size": "60 Colours" }, product: { name: "Creative Acrylic Marker Set" } };

test("listVariantImages: rejects a variant id that belongs to a DIFFERENT product — never readable cross-product", async () => {
  const productFindUnique = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const variantFindUnique = stub(prisma.productVariant, "findUnique", async () => ({ ...VARIANT_ON_PRODUCT_1, productId: "some-other-product" }));

  await assert.rejects(
    () => listVariantImages("product-1", "variant-1"),
    (error: unknown) => error instanceof AdminProductImageError && error.statusCode === 404
  );

  productFindUnique.restore();
  variantFindUnique.restore();
});

test("uploadImageForVariant: rejects a variant id that belongs to a DIFFERENT product — never writable cross-product", async () => {
  const productFindUnique = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const variantFindUnique = stub(prisma.productVariant, "findUnique", async () => ({ ...VARIANT_ON_PRODUCT_1, productId: "some-other-product" }));

  await assert.rejects(
    () =>
      uploadImageForVariant({
        productId: "product-1",
        variantId: "variant-1",
        buffer: Buffer.from("fake"),
        mimetype: "image/jpeg",
        size: 100,
        altText: "Some alt text",
      }),
    (error: unknown) => error instanceof AdminProductImageError && error.statusCode === 404
  );

  productFindUnique.restore();
  variantFindUnique.restore();
});

test("updateVariantImage: rejects an image id belonging to a DIFFERENT variant", async () => {
  const productFindUnique = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const variantFindUnique = stub(prisma.productVariant, "findUnique", async () => VARIANT_ON_PRODUCT_1);
  const imageFindUnique = stub(prisma.productImage, "findUnique", async () => ({
    id: "image-1",
    productId: "product-1",
    variantId: "some-other-variant",
    isPrimary: false,
  }));

  await assert.rejects(
    () => updateVariantImage("product-1", "variant-1", "image-1", { isPrimary: true }),
    (error: unknown) => error instanceof AdminProductImageError && error.statusCode === 404
  );

  productFindUnique.restore();
  variantFindUnique.restore();
  imageFindUnique.restore();
});

// Milestone 197: removing the last dedicated image must set imageUrl
// to null — never leave a stale URL and never "restore" a prior value,
// since none is preserved once dedicated images were adopted.
test("deleteVariantImage: removing the LAST dedicated image sets ProductVariant.imageUrl to null", async () => {
  const productFindUnique = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const variantFindUnique = stub(prisma.productVariant, "findUnique", async () => VARIANT_ON_PRODUCT_1);
  const imageFindUnique = stub(prisma.productImage, "findUnique", async () => ({
    id: "image-1",
    productId: "product-1",
    variantId: "variant-1",
    isPrimary: true,
    // Root-relative — isSupabaseStorageUrl (real, unstubbed) correctly
    // returns false for this, so no Storage cleanup call is attempted.
    url: "/images/legacy-static-asset.jpg",
  }));
  const imageDelete = stub(prisma.productImage, "delete", async () => ({}));
  // No remaining images for this variant once the only one is deleted.
  const imageFindFirst = stub(prisma.productImage, "findFirst", async () => null);
  const variantUpdate = stub(prisma.productVariant, "update", async ({ data }: { data: Record<string, unknown> }) => data);
  // The post-delete listVariantImages() re-fetch — stubbed empty, since
  // the just-deleted row was this variant's only one.
  const imageFindMany = stub(prisma.productImage, "findMany", async () => []);
  const transactionStub = stub(prisma, "$transaction", async (fn: (tx: typeof prisma) => unknown) => fn(prisma));

  await deleteVariantImage("product-1", "variant-1", "image-1");

  assert.equal(variantUpdate.fn.mock.callCount(), 1);
  assert.equal(variantUpdate.fn.mock.calls[0]!.arguments[0].data.imageUrl, null);

  productFindUnique.restore();
  variantFindUnique.restore();
  imageFindUnique.restore();
  imageDelete.restore();
  imageFindFirst.restore();
  variantUpdate.restore();
  imageFindMany.restore();
  transactionStub.restore();
});
