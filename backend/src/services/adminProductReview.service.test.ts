// Version 7, Milestone 171C: backend tests for adminProductReview.
// service.ts — the moderation half of the genuine product review
// system. See productReview.service.test.ts's own header comment for
// the stub() helper pattern this file reuses.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { AdminProductReviewError, approveReview, listReviewsForAdmin, recalculateProductRatingAggregate, rejectReview } from "./adminProductReview.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const PENDING_REVIEW = {
  id: "review-1",
  productId: "product-1",
  customerId: "cust-1",
  rating: 5,
  reviewText: "Wonderful book.",
  status: "PENDING",
  createdAt: new Date("2026-08-01"),
  approvedAt: null,
  customer: { firstName: "Thandiwe", lastName: "Mokoena" },
  orderItem: { productName: "ABC Colouring Book", productSlug: "abc-colouring-book" },
};

// $transaction in these tests just runs the callback with `prisma`
// itself standing in for the transaction client — the stubbed model
// methods below are on the same prisma object either way, so this
// keeps the test focused on the moderation logic itself rather than
// re-implementing Prisma's own transaction machinery.
function stubTransaction() {
  return stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
}

// ---------------------------------------------------------------------------
// approveReview / rejectReview: status-transition guard
// ---------------------------------------------------------------------------

test("approving a PENDING review succeeds and sets approvedAt", async () => {
  const tx = stubTransaction();
  const findUnique = stub(prisma.productReview, "findUnique", async () => PENDING_REVIEW);
  let capturedData: Record<string, unknown> = {};
  const update = stub(prisma.productReview, "update", async ({ data }: { data: Record<string, unknown> }) => {
    capturedData = data;
    return { ...PENDING_REVIEW, ...data };
  });
  const aggregate = stub(prisma.productReview, "aggregate", async () => ({ _avg: { rating: 5 }, _count: { _all: 1 } }));
  const productUpdate = stub(prisma.product, "update", async () => ({}));

  const result = await approveReview("review-1");

  assert.equal(result.status, "APPROVED");
  assert.equal(capturedData.status, "APPROVED");
  assert.ok(capturedData.approvedAt instanceof Date);
  assert.equal(productUpdate.fn.mock.callCount(), 1);

  tx.restore();
  findUnique.restore();
  update.restore();
  aggregate.restore();
  productUpdate.restore();
});

test("rejecting a PENDING review succeeds with approvedAt left null", async () => {
  const tx = stubTransaction();
  const findUnique = stub(prisma.productReview, "findUnique", async () => PENDING_REVIEW);
  let capturedData: Record<string, unknown> = {};
  const update = stub(prisma.productReview, "update", async ({ data }: { data: Record<string, unknown> }) => {
    capturedData = data;
    return { ...PENDING_REVIEW, ...data };
  });
  const aggregate = stub(prisma.productReview, "aggregate", async () => ({ _avg: { rating: null }, _count: { _all: 0 } }));
  const productUpdate = stub(prisma.product, "update", async () => ({}));

  const result = await rejectReview("review-1");

  assert.equal(result.status, "REJECTED");
  assert.equal(capturedData.approvedAt, null);

  tx.restore();
  findUnique.restore();
  update.restore();
  aggregate.restore();
  productUpdate.restore();
});

test("approving a nonexistent review throws 404", async () => {
  const tx = stubTransaction();
  const findUnique = stub(prisma.productReview, "findUnique", async () => null);

  await assert.rejects(
    () => approveReview("does-not-exist"),
    (error: unknown) => error instanceof AdminProductReviewError && error.statusCode === 404
  );

  tx.restore();
  findUnique.restore();
});

for (const alreadyModeratedStatus of ["APPROVED", "REJECTED"]) {
  test(`moderating an already-${alreadyModeratedStatus} review is rejected (409), never overwritten`, async () => {
    const tx = stubTransaction();
    const findUnique = stub(prisma.productReview, "findUnique", async () => ({ ...PENDING_REVIEW, status: alreadyModeratedStatus }));
    const update = stub(prisma.productReview, "update", async () => {
      throw new Error("must never be called — an already-moderated review must never be silently re-moderated");
    });

    await assert.rejects(
      () => approveReview("review-1"),
      (error: unknown) => error instanceof AdminProductReviewError && error.statusCode === 409
    );
    assert.equal(update.fn.mock.callCount(), 0);

    tx.restore();
    findUnique.restore();
    update.restore();
  });
}

// ---------------------------------------------------------------------------
// listReviewsForAdmin: defaults to the PENDING moderation queue
// ---------------------------------------------------------------------------

test("listReviewsForAdmin defaults to status PENDING when no filter is given", async () => {
  let capturedWhere: { status?: string } = {};
  const findMany = stub(prisma.productReview, "findMany", async (args: { where: typeof capturedWhere }) => {
    capturedWhere = args.where;
    return [];
  });

  await listReviewsForAdmin(undefined);

  assert.equal(capturedWhere.status, "PENDING");

  findMany.restore();
});

test('listReviewsForAdmin with "all" removes the status filter entirely', async () => {
  let capturedWhere: { status?: string } = { status: "should-not-survive" };
  const findMany = stub(prisma.productReview, "findMany", async (args: { where: typeof capturedWhere }) => {
    capturedWhere = args.where;
    return [];
  });

  await listReviewsForAdmin("all");

  assert.deepEqual(capturedWhere, {});

  findMany.restore();
});

test("listReviewsForAdmin with an explicit status filters by exactly that status", async () => {
  let capturedWhere: { status?: string } = {};
  const findMany = stub(prisma.productReview, "findMany", async (args: { where: typeof capturedWhere }) => {
    capturedWhere = args.where;
    return [];
  });

  await listReviewsForAdmin("APPROVED" as never);

  assert.equal(capturedWhere.status, "APPROVED");

  findMany.restore();
});

// ---------------------------------------------------------------------------
// recalculateProductRatingAggregate: only APPROVED reviews ever count
// ---------------------------------------------------------------------------

test("recalculateProductRatingAggregate counts only APPROVED reviews and rounds to 2 decimals", async () => {
  let capturedAggregateWhere: { status?: string } = {};
  const aggregate = stub(prisma.productReview, "aggregate", async (args: { where: typeof capturedAggregateWhere }) => {
    capturedAggregateWhere = args.where;
    return { _avg: { rating: 4.666666 }, _count: { _all: 3 } };
  });
  let capturedUpdateData: Record<string, unknown> = {};
  const productUpdate = stub(prisma.product, "update", async ({ data }: { data: Record<string, unknown> }) => {
    capturedUpdateData = data;
    return {};
  });

  await recalculateProductRatingAggregate(prisma as never, "product-1");

  assert.equal(capturedAggregateWhere.status, "APPROVED");
  assert.equal(capturedUpdateData.reviewCount, 3);
  assert.equal(capturedUpdateData.ratingAverage, 4.67);

  aggregate.restore();
  productUpdate.restore();
});

test("recalculateProductRatingAggregate resets to 0/0 when there are no approved reviews left", async () => {
  const aggregate = stub(prisma.productReview, "aggregate", async () => ({ _avg: { rating: null }, _count: { _all: 0 } }));
  let capturedUpdateData: Record<string, unknown> = {};
  const productUpdate = stub(prisma.product, "update", async ({ data }: { data: Record<string, unknown> }) => {
    capturedUpdateData = data;
    return {};
  });

  await recalculateProductRatingAggregate(prisma as never, "product-1");

  assert.equal(capturedUpdateData.reviewCount, 0);
  assert.equal(capturedUpdateData.ratingAverage, 0);

  aggregate.restore();
  productUpdate.restore();
});
