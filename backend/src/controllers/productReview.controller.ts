// Version 7, Milestone 171C: genuine product reviews — public reading
// (no auth) and customer submission (requireCustomerAuth, mounted in
// customer.routes.ts). Every handler below that touches
// req.customerUser only ever uses req.customerUser.id, never a
// customerId from the request body/query/params — same discipline as
// customerOrder.controller.ts, so a customer can never act as anyone
// else.

import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam } from "../utils/query.js";
import {
  ProductReviewError,
  listApprovedReviewsForProduct,
  listEligibleReviewCandidates,
  listReviewsForCustomer,
  submitProductReview,
} from "../services/productReview.service.js";

const DEFAULT_LIST_LIMIT = 10;
const MAX_LIST_LIMIT = 50;

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Public — no auth. Only ever returns APPROVED reviews (enforced
// inside the service, not here — see its own comment).
export async function listPublicProductReviewsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { slug } = req.params;
    if (!slug) {
      sendError(res, { message: "Product slug is required", statusCode: 400 });
      return;
    }

    const page = parsePositiveIntParam(req.query.page) ?? 1;
    const limit = Math.min(parsePositiveIntParam(req.query.limit) ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);

    const result = await listApprovedReviewsForProduct(slug, page, limit);
    sendSuccess(res, { message: "Reviews retrieved successfully", data: result });
  } catch (error) {
    if (error instanceof ProductReviewError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

// Set by requireCustomerAuth — this route is unreachable without it.
export async function listEligibleReviewCandidatesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const candidates = await listEligibleReviewCandidates(customerId);
    sendSuccess(res, { message: "Reviewable purchases retrieved successfully", data: { candidates } });
  } catch (error) {
    next(error);
  }
}

export async function listMyReviewsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const reviews = await listReviewsForCustomer(customerId);
    sendSuccess(res, { message: "Your reviews retrieved successfully", data: { reviews } });
  } catch (error) {
    next(error);
  }
}

export async function submitProductReviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const review = await submitProductReview(customerId, req.body ?? {});
    sendSuccess(res, { message: "Review submitted successfully. It will appear publicly once approved.", statusCode: 201, data: review });
  } catch (error) {
    if (error instanceof ProductReviewError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    if (isPrismaUniqueConstraintError(error)) {
      sendError(res, { message: "You have already reviewed this product.", statusCode: 409 });
      return;
    }
    next(error);
  }
}
