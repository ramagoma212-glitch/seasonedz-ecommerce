// Version 7, Milestone 171C: genuine, verified-purchase product
// reviews — customer-facing half (submission + public reading). See
// adminProductReview.service.ts for the moderation half.
//
// The one rule this whole file exists to enforce: a customer may only
// review a product they themselves genuinely bought in an order whose
// paymentStatus is PAID. That check is never trusted from the
// frontend — findEligibleOrderItem() below re-derives it from the
// database on every single call, the same discipline
// digitalDownload.service.ts already uses for download entitlement
// (see that file's own header comment).

import { PaymentStatus, Prisma, ReviewStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { renderAdminNewReviewEmail } from "./email/emailTemplates.js";
import { env } from "../config/env.js";
import * as notificationEngine from "./notificationEngine.service.js";

export class ProductReviewError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ProductReviewError";
    this.statusCode = statusCode;
  }
}

const MIN_RATING = 1;
const MAX_RATING = 5;
const MIN_REVIEW_TEXT_LENGTH = 10;
const MAX_REVIEW_TEXT_LENGTH = 2000;

// Strict on purpose — this reads a JSON request body, not a URL query
// string, so a well-formed request always sends a real JSON number.
// Unlike parsePositiveIntParam (query.ts), no string coercion happens
// here: accepting "5" would also mean accepting "5e0", " 5 ", "05" and
// similar oddities Number() tolerates, for no real benefit.
function parseRating(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < MIN_RATING || raw > MAX_RATING) {
    throw new ProductReviewError(`rating must be a whole number from ${MIN_RATING} to ${MAX_RATING}.`);
  }
  return raw;
}

function parseReviewText(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new ProductReviewError("reviewText must be a string.");
  }
  const trimmed = raw.trim();
  if (trimmed.length < MIN_REVIEW_TEXT_LENGTH) {
    throw new ProductReviewError(`reviewText must be at least ${MIN_REVIEW_TEXT_LENGTH} characters.`);
  }
  if (trimmed.length > MAX_REVIEW_TEXT_LENGTH) {
    throw new ProductReviewError(`reviewText must be ${MAX_REVIEW_TEXT_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

function parseOrderItemId(raw: unknown): string {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new ProductReviewError("orderItemId is required.");
  }
  return raw.trim();
}

// The one authoritative eligibility check: a real OrderItem, for this
// exact product, belonging to an Order that (a) is this customer's own
// (never trusted from a request body — always req.customerUser.id) and
// (b) has paymentStatus PAID. productId is required (not just
// nullable) here on purpose — an OrderItem whose product was later
// deleted from the catalogue has no live Product row left to attach a
// review to, so it can never be eligible.
async function findEligibleOrderItem(customerId: string, orderItemId: string) {
  return prisma.orderItem.findFirst({
    where: {
      id: orderItemId,
      productId: { not: null },
      order: { customerId, paymentStatus: PaymentStatus.PAID },
    },
    select: { id: true, productId: true, productName: true, productSlug: true },
  });
}

export interface EligibleReviewCandidate {
  orderItemId: string;
  productId: string;
  productSlug: string;
  productName: string;
  orderNumber: string;
  purchasedAt: Date;
}

// Every PAID order item this customer has for a product they haven't
// already reviewed — the frontend's Order Details page uses this to
// decide which purchased items to offer a "Write a Review" prompt for
// (Part H of the milestone brief). Deliberately one candidate per
// eligible OrderItem (not deduplicated by product) so each purchase
// still shows its own order context, even though submitting a review
// for one immediately makes any other candidate for the same product
// disappear (the productId/customerId unique constraint allows only
// one review per product either way).
export async function listEligibleReviewCandidates(customerId: string): Promise<EligibleReviewCandidate[]> {
  const alreadyReviewedProductIds = (
    await prisma.productReview.findMany({ where: { customerId }, select: { productId: true } })
  ).map((review) => review.productId);

  const orderItems = await prisma.orderItem.findMany({
    where: {
      productId: { not: null, notIn: alreadyReviewedProductIds },
      order: { customerId, paymentStatus: PaymentStatus.PAID },
    },
    select: { id: true, productId: true, productName: true, productSlug: true, createdAt: true, order: { select: { orderNumber: true } } },
    orderBy: { createdAt: "desc" },
  });

  return orderItems.map((item) => ({
    orderItemId: item.id,
    // Safe: filtered by productId: { not: null } above.
    productId: item.productId as string,
    productSlug: item.productSlug,
    productName: item.productName,
    orderNumber: item.order.orderNumber,
    purchasedAt: item.createdAt,
  }));
}

export interface CustomerReviewOutput {
  id: string;
  productId: string;
  productSlug: string;
  productName: string;
  rating: number;
  reviewText: string;
  status: ReviewStatus;
  createdAt: Date;
}

// The customer's own submitted reviews, any status — "my reviews" in
// the account area, so a customer can see "Pending" without it ever
// being publicly visible (see listApprovedReviewsForProduct below for
// the public equivalent, APPROVED-only).
export async function listReviewsForCustomer(customerId: string): Promise<CustomerReviewOutput[]> {
  const reviews = await prisma.productReview.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: { orderItem: { select: { productSlug: true, productName: true } } },
  });

  return reviews.map((review) => ({
    id: review.id,
    productId: review.productId,
    productSlug: review.orderItem.productSlug,
    productName: review.orderItem.productName,
    rating: review.rating,
    reviewText: review.reviewText,
    status: review.status,
    createdAt: review.createdAt,
  }));
}

// Throws ProductReviewError (400/403/404) for every rejected case;
// P2002 (duplicate productId+customerId) is left to propagate
// uncaught, same convention as adminProduct.controller.ts's own
// isPrismaUniqueConstraintError() — the controller translates it to a
// clean 409, never a raw 500.
export async function submitProductReview(
  customerId: string,
  input: { orderItemId?: unknown; rating?: unknown; reviewText?: unknown }
): Promise<CustomerReviewOutput> {
  const orderItemId = parseOrderItemId(input.orderItemId);
  const rating = parseRating(input.rating);
  const reviewText = parseReviewText(input.reviewText);

  const orderItem = await findEligibleOrderItem(customerId, orderItemId);
  if (!orderItem || !orderItem.productId) {
    throw new ProductReviewError("You can only review products you have purchased in a paid order.", 403);
  }

  const review = await prisma.productReview.create({
    data: {
      productId: orderItem.productId,
      customerId,
      orderItemId: orderItem.id,
      rating,
      reviewText,
      status: ReviewStatus.PENDING,
    },
  });

  // Version 7, Milestone 174B: fire-and-forget, never allowed to affect
  // whether the review submission itself succeeded — the create() above
  // has already committed by the time this runs.
  void notifyAdminNewReview({ reviewId: review.id, customerId, productName: orderItem.productName, rating: review.rating, reviewText: review.reviewText }).catch((error) => {
    console.warn(`[notifications] failed to notify admin of new review=${review.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
  });

  return {
    id: review.id,
    productId: review.productId,
    productSlug: orderItem.productSlug,
    productName: orderItem.productName,
    rating: review.rating,
    reviewText: review.reviewText,
    status: review.status,
    createdAt: review.createdAt,
  };
}

async function notifyAdminNewReview(params: { reviewId: string; customerId: string; productName: string; rating: number; reviewText: string }): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: params.customerId }, select: { firstName: true, lastName: true } });
  const customerName = customer ? `${customer.firstName} ${customer.lastName}`.trim() : "A customer";

  await notificationEngine.enqueueAndSendNow({
    eventType: "ADMIN_NEW_REVIEW",
    templateName: "admin-new-review",
    recipientEmail: env.adminNotificationEmail,
    dedupeKey: `ADMIN_NEW_REVIEW:${params.reviewId}`,
    rendered: renderAdminNewReviewEmail({ productName: params.productName, customerName, rating: params.rating, reviewText: params.reviewText }),
  });
}

export interface PublicReviewOutput {
  id: string;
  rating: number;
  reviewText: string;
  // Privacy-conscious presentation (Part G of the milestone brief) —
  // first name plus surname initial, e.g. "Thandiwe M." — never a full
  // name, email, phone, address, order number or internal customer id.
  displayName: string;
  createdAt: Date;
}

function toPublicDisplayName(firstName: string, lastName: string): string {
  const initial = lastName.trim().charAt(0);
  return initial ? `${firstName.trim()} ${initial.toUpperCase()}.` : firstName.trim();
}

export interface PublicReviewList {
  reviews: PublicReviewOutput[];
  total: number;
  page: number;
  limit: number;
}

// Public, unauthenticated — APPROVED only, ever. PENDING/REJECTED
// reviews are never reachable through this function no matter what a
// caller passes in, since the `where` clause hardcodes the status
// rather than accepting one.
export async function listApprovedReviewsForProduct(productSlug: string, page: number, limit: number): Promise<PublicReviewList> {
  const product = await prisma.product.findUnique({ where: { slug: productSlug }, select: { id: true } });
  if (!product) {
    throw new ProductReviewError(`Product not found: ${productSlug}`, 404);
  }

  const where: Prisma.ProductReviewWhereInput = { productId: product.id, status: ReviewStatus.APPROVED };

  const [rows, total] = await Promise.all([
    prisma.productReview.findMany({
      where,
      orderBy: { approvedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        rating: true,
        reviewText: true,
        createdAt: true,
        customer: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.productReview.count({ where }),
  ]);

  return {
    reviews: rows.map((review) => ({
      id: review.id,
      rating: review.rating,
      reviewText: review.reviewText,
      displayName: toPublicDisplayName(review.customer.firstName, review.customer.lastName),
      createdAt: review.createdAt,
    })),
    total,
    page,
    limit,
  };
}
