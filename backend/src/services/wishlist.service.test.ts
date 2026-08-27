// Version 7, Milestone 174C: server-backed wishlist — brief sections
// 26-29, 57.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { WishlistError, addToWishlist, listWishlistForCustomer, mergeGuestWishlistIntoAccount, removeFromWishlist } from "./wishlist.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

class FakePrismaP2002Error extends Error {
  code = "P2002";
}

test("addToWishlist: rejects a nonexistent product with 404", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => null);

  await assert.rejects(
    () => addToWishlist("cust-1", "does-not-exist"),
    (error: unknown) => error instanceof WishlistError && error.statusCode === 404
  );

  productFind.restore();
});

test("addToWishlist: adding an already-wishlisted product is a safe no-op, never an error", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const create = stub(prisma.wishlistItem, "create", async () => {
    throw new FakePrismaP2002Error("Unique constraint failed");
  });

  await assert.doesNotReject(() => addToWishlist("cust-1", "product-1"));

  productFind.restore();
  create.restore();
});

test("removeFromWishlist: scopes the delete to this exact customer and the product's real id (resolved from the slug) only", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const deleteMany = stub(prisma.wishlistItem, "deleteMany", async () => ({ count: 1 }));

  await removeFromWishlist("cust-1", "abc-colouring-book");
  const where = deleteMany.fn.mock.calls[0]!.arguments[0].where;
  assert.equal(where.customerId, "cust-1");
  assert.equal(where.productId, "product-1");

  productFind.restore();
  deleteMany.restore();
});

test("removeFromWishlist: a slug that no longer resolves to a real product is a safe no-op", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => null);
  const deleteMany = stub(prisma.wishlistItem, "deleteMany", mock.fn(async () => ({ count: 0 })));

  await removeFromWishlist("cust-1", "does-not-exist");
  assert.equal(deleteMany.fn.mock.callCount(), 0);

  productFind.restore();
  deleteMany.restore();
});

test("listWishlistForCustomer: a wishlisted product later deleted from the catalogue is silently excluded, never a broken entry", async () => {
  const findMany = stub(prisma.wishlistItem, "findMany", async () => [
    { id: "wish-1", productId: "product-1", createdAt: new Date(), product: null },
    {
      id: "wish-2",
      productId: "product-2",
      createdAt: new Date(),
      product: { id: "product-2", name: "ABC", slug: "abc", price: new Prisma.Decimal("100"), stockQuantity: 5, images: [] },
    },
  ]);

  const result = await listWishlistForCustomer("cust-1");
  assert.equal(result.length, 1);
  assert.equal(result[0]!.productId, "product-2");
  assert.equal(result[0]!.inStock, true);

  findMany.restore();
});

test("mergeGuestWishlistIntoAccount: does nothing for an empty list", async () => {
  const findMany = stub(prisma.product, "findMany", mock.fn(async () => []));
  await mergeGuestWishlistIntoAccount("cust-1", []);
  assert.equal(findMany.fn.mock.callCount(), 0);
  findMany.restore();
});

test("mergeGuestWishlistIntoAccount: a product id that no longer exists is silently skipped, never errors the whole merge", async () => {
  const productFindMany = stub(prisma.product, "findMany", async () => [{ id: "product-1" }]); // "does-not-exist" filtered out by the DB query itself
  const create = stub(prisma.wishlistItem, "create", mock.fn(async () => ({})));

  await mergeGuestWishlistIntoAccount("cust-1", ["product-1", "does-not-exist"]);
  assert.equal(create.fn.mock.callCount(), 1, "only the real product id was merged");

  productFindMany.restore();
  create.restore();
});

test("mergeGuestWishlistIntoAccount: a product already saved server-side is silently absorbed, never a thrown duplicate error", async () => {
  const productFindMany = stub(prisma.product, "findMany", async () => [{ id: "product-1" }]);
  const create = stub(prisma.wishlistItem, "create", async () => {
    throw new FakePrismaP2002Error("Unique constraint failed");
  });

  await assert.doesNotReject(() => mergeGuestWishlistIntoAccount("cust-1", ["product-1"]));

  productFindMany.restore();
  create.restore();
});

test("mergeGuestWishlistIntoAccount: duplicate slugs in the input list are deduplicated before ever querying", async () => {
  const productFindMany = mock.fn(async (args: { where: { slug: { in: string[] } } }) => args.where.slug.in.map((slug) => ({ id: `id-for-${slug}` })));
  const restoreFindMany = stub(prisma.product, "findMany", productFindMany);
  const create = stub(prisma.wishlistItem, "create", mock.fn(async () => ({})));

  await mergeGuestWishlistIntoAccount("cust-1", ["product-1", "product-1", "product-1"]);
  assert.deepEqual(productFindMany.mock.calls[0]!.arguments[0].where.slug.in, ["product-1"]);

  restoreFindMany.restore();
  create.restore();
});
