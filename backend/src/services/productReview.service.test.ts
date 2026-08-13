// Version 7, Milestone 171C: backend security/validation tests for
// productReview.service.ts — the customer-facing half of the genuine
// product review system (submission + public reading). See
// adminProductReview.service.test.ts for the moderation half, and
// digitalDownload.service.test.ts's own header comment for why the
// stub() helper below assigns directly to Prisma's model-delegate
// proxies instead of using node:test's built-in mock.method().
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  ProductReviewError,
  listApprovedReviewsForProduct,
  listEligibleReviewCandidates,
  listReviewsForCustomer,
  submitProductReview,
} from "./productReview.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const ELIGIBLE_ORDER_ITEM = {
  id: "item-1",
  productId: "product-1",
  productName: "ABC Colouring Book",
  productSlug: "abc-colouring-book",
};

// ---------------------------------------------------------------------------
// submitProductReview: purchase-eligibility gate
// ---------------------------------------------------------------------------

test("customer with no matching purchase cannot review (findFirst returns null)", async () => {
  const findFirst = stub(prisma.orderItem, "findFirst", async () => null);

  await assert.rejects(
    () => submitProductReview("cust-1", { orderItemId: "item-1", rating: 5, reviewText: "Wonderful product, highly recommend!" }),
    (error: unknown) => error instanceof ProductReviewError && error.statusCode === 403
  );

  findFirst.restore();
});

test("eligibility query scopes by customerId and paymentStatus PAID — never trusts a stored flag", async () => {
  let capturedWhere: unknown;
  const findFirst = stub(prisma.orderItem, "findFirst", async (args: { where: unknown }) => {
    capturedWhere = args.where;
    return null;
  });

  await assert.rejects(() => submitProductReview("cust-1", { orderItemId: "item-1", rating: 4, reviewText: "Good quality book overall." }));

  const where = capturedWhere as { id: string; order: { customerId: string; paymentStatus: string } };
  assert.equal(where.id, "item-1");
  assert.equal(where.order.customerId, "cust-1");
  assert.equal(where.order.paymentStatus, "PAID");

  findFirst.restore();
});

test("PAID purchaser can submit a valid review (happy path)", async () => {
  const findFirst = stub(prisma.orderItem, "findFirst", async () => ELIGIBLE_ORDER_ITEM);
  const create = stub(prisma.productReview, "create", async ({ data }: { data: Record<string, unknown> }) => ({
    id: "review-1",
    productId: data.productId,
    rating: data.rating,
    reviewText: data.reviewText,
    status: "PENDING",
    createdAt: new Date("2026-08-12"),
  }));

  const result = await submitProductReview("cust-1", {
    orderItemId: "item-1",
    rating: 5,
    reviewText: "Wonderful product, my kids love it every single day.",
  });

  assert.equal(result.status, "PENDING");
  assert.equal(result.productId, "product-1");
  assert.equal(result.productSlug, "abc-colouring-book");
  assert.equal(create.fn.mock.callCount(), 1);

  findFirst.restore();
  create.restore();
});

test("submitted review always starts PENDING, regardless of what a caller might try to pass", async () => {
  const findFirst = stub(prisma.orderItem, "findFirst", async () => ELIGIBLE_ORDER_ITEM);
  let capturedData: Record<string, unknown> = {};
  const create = stub(prisma.productReview, "create", async ({ data }: { data: Record<string, unknown> }) => {
    capturedData = data;
    return { id: "review-1", productId: data.productId, rating: data.rating, reviewText: data.reviewText, status: "PENDING", createdAt: new Date() };
  });

  // status/approvedAt are not accepted input fields at all — parseRating/
  // parseReviewText/parseOrderItemId only ever read rating/reviewText/
  // orderItemId off the input object, so even a malicious extra field
  // here can never reach the create() call.
  await submitProductReview("cust-1", {
    orderItemId: "item-1",
    rating: 5,
    reviewText: "Wonderful product, my kids love it every single day.",
    // @ts-expect-error deliberately testing that extra fields are ignored
    status: "APPROVED",
  });

  assert.equal(capturedData.status, "PENDING");
  assert.equal("approvedAt" in capturedData, false);

  findFirst.restore();
  create.restore();
});

// ---------------------------------------------------------------------------
// submitProductReview: input validation
// ---------------------------------------------------------------------------

for (const badRating of [0, -1, 6, 100, 1.5, "5", null, undefined, "not-a-number"]) {
  test(`rating ${JSON.stringify(badRating)} is rejected`, async () => {
    await assert.rejects(
      () => submitProductReview("cust-1", { orderItemId: "item-1", rating: badRating, reviewText: "A valid length review text here." }),
      (error: unknown) => error instanceof ProductReviewError && error.statusCode === 400
    );
  });
}

for (const goodRating of [1, 2, 3, 4, 5]) {
  test(`rating ${goodRating} is accepted`, async () => {
    const findFirst = stub(prisma.orderItem, "findFirst", async () => ELIGIBLE_ORDER_ITEM);
    const create = stub(prisma.productReview, "create", async ({ data }: { data: Record<string, unknown> }) => ({
      id: "review-1",
      productId: data.productId,
      rating: data.rating,
      reviewText: data.reviewText,
      status: "PENDING",
      createdAt: new Date(),
    }));

    const result = await submitProductReview("cust-1", { orderItemId: "item-1", rating: goodRating, reviewText: "A perfectly valid review length." });
    assert.equal(result.rating, goodRating);

    findFirst.restore();
    create.restore();
  });
}

test("review text shorter than the minimum length is rejected", async () => {
  await assert.rejects(
    () => submitProductReview("cust-1", { orderItemId: "item-1", rating: 5, reviewText: "Too short" }),
    (error: unknown) => error instanceof ProductReviewError && error.statusCode === 400
  );
});

test("review text longer than the maximum length is rejected", async () => {
  await assert.rejects(
    () => submitProductReview("cust-1", { orderItemId: "item-1", rating: 5, reviewText: "x".repeat(2001) }),
    (error: unknown) => error instanceof ProductReviewError && error.statusCode === 400
  );
});

test("missing orderItemId is rejected before any database call", async () => {
  const findFirst = stub(prisma.orderItem, "findFirst", async () => {
    throw new Error("must never be called — validation should short-circuit first");
  });

  await assert.rejects(
    () => submitProductReview("cust-1", { rating: 5, reviewText: "A perfectly valid review length." }),
    (error: unknown) => error instanceof ProductReviewError && error.statusCode === 400
  );
  assert.equal(findFirst.fn.mock.callCount(), 0);

  findFirst.restore();
});

// ---------------------------------------------------------------------------
// submitProductReview: duplicate-review rule
// ---------------------------------------------------------------------------

test("a duplicate (productId, customerId) review is rejected — the unique-constraint error propagates unchanged, never swallowed", async () => {
  const findFirst = stub(prisma.orderItem, "findFirst", async () => ELIGIBLE_ORDER_ITEM);
  const duplicateError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`productId`,`customerId`)", {
    code: "P2002",
    clientVersion: "5.22.0",
    meta: { target: ["productId", "customerId"] },
  });
  const create = stub(prisma.productReview, "create", async () => {
    throw duplicateError;
  });

  await assert.rejects(
    () => submitProductReview("cust-1", { orderItemId: "item-1", rating: 5, reviewText: "Wonderful product, my kids love it every day." }),
    (error: unknown) => error === duplicateError
  );

  findFirst.restore();
  create.restore();
});

// ---------------------------------------------------------------------------
// listEligibleReviewCandidates: excludes already-reviewed products
// ---------------------------------------------------------------------------

test("eligible-candidates list excludes products the customer has already reviewed", async () => {
  const reviewFindMany = stub(prisma.productReview, "findMany", async () => [{ productId: "product-already-reviewed" }]);
  let capturedWhere: { productId?: { notIn?: string[] } } = {};
  const itemFindMany = stub(prisma.orderItem, "findMany", async (args: { where: typeof capturedWhere }) => {
    capturedWhere = args.where;
    return [];
  });

  await listEligibleReviewCandidates("cust-1");

  assert.deepEqual(capturedWhere.productId?.notIn, ["product-already-reviewed"]);

  reviewFindMany.restore();
  itemFindMany.restore();
});

// ---------------------------------------------------------------------------
// listApprovedReviewsForProduct: public read — APPROVED only, privacy-safe
// ---------------------------------------------------------------------------

test("public review listing hardcodes status APPROVED regardless of anything else", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  let capturedWhere: { status?: string } = {};
  const findMany = stub(prisma.productReview, "findMany", async (args: { where: typeof capturedWhere }) => {
    capturedWhere = args.where;
    return [];
  });
  const count = stub(prisma.productReview, "count", async () => 0);

  await listApprovedReviewsForProduct("abc-colouring-book", 1, 10);

  assert.equal(capturedWhere.status, "APPROVED");

  productFind.restore();
  findMany.restore();
  count.restore();
});

test("public review listing throws 404 for a nonexistent product slug", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => null);

  await assert.rejects(
    () => listApprovedReviewsForProduct("does-not-exist", 1, 10),
    (error: unknown) => error instanceof ProductReviewError && error.statusCode === 404
  );

  productFind.restore();
});

test("public review display name is privacy-safe (first name + surname initial), never the full name or any contact detail", async () => {
  const productFind = stub(prisma.product, "findUnique", async () => ({ id: "product-1" }));
  const findMany = stub(prisma.productReview, "findMany", async () => [
    {
      id: "review-1",
      rating: 5,
      reviewText: "Lovely book.",
      createdAt: new Date("2026-08-01"),
      customer: { firstName: "Thandiwe", lastName: "Mokoena" },
    },
  ]);
  const count = stub(prisma.productReview, "count", async () => 1);

  const result = await listApprovedReviewsForProduct("abc-colouring-book", 1, 10);

  assert.equal(result.reviews[0]?.displayName, "Thandiwe M.");
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("Mokoena"), false);
  assert.equal(serialized.includes("@"), false);

  productFind.restore();
  findMany.restore();
  count.restore();
});

// ---------------------------------------------------------------------------
// listReviewsForCustomer: "my reviews" — any status, own reviews only
// ---------------------------------------------------------------------------

test("listReviewsForCustomer scopes strictly to the given customerId", async () => {
  let capturedWhere: { customerId?: string } = {};
  const findMany = stub(prisma.productReview, "findMany", async (args: { where: typeof capturedWhere }) => {
    capturedWhere = args.where;
    return [];
  });

  await listReviewsForCustomer("cust-1");

  assert.equal(capturedWhere.customerId, "cust-1");

  findMany.restore();
});
