// Version 7, Milestone 171C: admin moderation of genuine, customer-
// submitted product reviews. Moderation only — there is deliberately
// no function anywhere in this file that creates a ProductReview row.
// An admin can only approve or reject what a real customer already
// submitted through productReview.service.ts's submitProductReview();
// the milestone brief is explicit that an "Add testimonial"/"Create
// customer review" admin feature must never exist.

import { Prisma, ReviewStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";

export class AdminProductReviewError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminProductReviewError";
    this.statusCode = statusCode;
  }
}

export interface AdminReviewOutput {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  customerName: string;
  rating: number;
  reviewText: string;
  status: ReviewStatus;
  createdAt: Date;
  approvedAt: Date | null;
}

function toAdminReviewOutput(review: {
  id: string;
  productId: string;
  rating: number;
  reviewText: string;
  status: ReviewStatus;
  createdAt: Date;
  approvedAt: Date | null;
  customer: { firstName: string; lastName: string };
  orderItem: { productName: string; productSlug: string };
}): AdminReviewOutput {
  return {
    id: review.id,
    productId: review.productId,
    productName: review.orderItem.productName,
    productSlug: review.orderItem.productSlug,
    // Full name here (unlike the privacy-conscious public display
    // name in productReview.service.ts) — this is the admin-only
    // moderation view, never returned by any public/customer endpoint.
    customerName: `${review.customer.firstName} ${review.customer.lastName}`,
    rating: review.rating,
    reviewText: review.reviewText,
    status: review.status,
    createdAt: review.createdAt,
    approvedAt: review.approvedAt,
  };
}

const adminReviewInclude = {
  customer: { select: { firstName: true, lastName: true } },
  orderItem: { select: { productName: true, productSlug: true } },
} satisfies Prisma.ProductReviewInclude;

// Defaults to PENDING (the moderation queue) when no status filter is
// given — the same "forgiving convenience filter" convention as
// parseProductStatusFilter in adminProduct.controller.ts, except here
// an explicit "all" is required to see every status at once, so the
// admin review screen opens on the actual moderation queue by default
// rather than a mixed list.
export async function listReviewsForAdmin(statusFilter: ReviewStatus | "all" | undefined): Promise<AdminReviewOutput[]> {
  let where: Prisma.ProductReviewWhereInput;
  if (statusFilter === "all") {
    where = {};
  } else if (statusFilter) {
    where = { status: statusFilter };
  } else {
    where = { status: ReviewStatus.PENDING };
  }

  const reviews = await prisma.productReview.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: adminReviewInclude,
  });

  return reviews.map(toAdminReviewOutput);
}

// Recomputes Product.ratingAverage/reviewCount from scratch, counting
// only APPROVED reviews — matches schema.prisma's own comment on those
// two fields ("recalculated whenever ... reviews are created/removed —
// not maintained by hand"). Called after every approve/reject inside
// the same transaction as the status change, so the aggregate can
// never drift out of sync with the actual set of approved reviews.
export async function recalculateProductRatingAggregate(
  tx: Prisma.TransactionClient,
  productId: string
): Promise<void> {
  const aggregate = await tx.productReview.aggregate({
    where: { productId, status: ReviewStatus.APPROVED },
    _avg: { rating: true },
    _count: { _all: true },
  });

  await tx.product.update({
    where: { id: productId },
    data: {
      reviewCount: aggregate._count._all,
      // Rounded to 2 decimal places to match ratingAverage's own
      // @db.Decimal(3, 2) column precision — avoids Prisma silently
      // truncating a longer float into that column in a way that
      // could differ across database drivers.
      ratingAverage: aggregate._count._all > 0 ? Math.round((aggregate._avg.rating ?? 0) * 100) / 100 : 0,
    },
  });
}

async function transitionReviewStatus(
  reviewId: string,
  newStatus: typeof ReviewStatus.APPROVED | typeof ReviewStatus.REJECTED
): Promise<AdminReviewOutput> {
  return prisma.$transaction(async (tx) => {
    const review = await tx.productReview.findUnique({ where: { id: reviewId }, include: adminReviewInclude });
    if (!review) {
      throw new AdminProductReviewError(`Review not found: ${reviewId}`, 404);
    }

    if (review.status !== ReviewStatus.PENDING) {
      throw new AdminProductReviewError(`Only a PENDING review can be moderated (this review is ${review.status}).`, 409);
    }

    const updated = await tx.productReview.update({
      where: { id: reviewId },
      data: {
        status: newStatus,
        approvedAt: newStatus === ReviewStatus.APPROVED ? new Date() : null,
      },
      include: adminReviewInclude,
    });

    await recalculateProductRatingAggregate(tx, review.productId);

    return toAdminReviewOutput(updated);
  });
}

export async function approveReview(reviewId: string): Promise<AdminReviewOutput> {
  return transitionReviewStatus(reviewId, ReviewStatus.APPROVED);
}

export async function rejectReview(reviewId: string): Promise<AdminReviewOutput> {
  return transitionReviewStatus(reviewId, ReviewStatus.REJECTED);
}
