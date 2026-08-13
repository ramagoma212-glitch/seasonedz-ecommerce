// Version 7, Milestone 171C: admin moderation endpoints for genuine
// product reviews. Mounted behind requireAdminAuth at the router level
// (adminDashboard.routes.ts), same as every other admin route — no
// per-handler auth check needed here. Moderation only: approve/reject
// an existing PENDING review. No handler in this file (or anywhere
// else) creates a review — see adminProductReview.service.ts's own
// header comment.

import type { NextFunction, Request, Response } from "express";
import { ReviewStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { AdminProductReviewError, approveReview, listReviewsForAdmin, rejectReview } from "../services/adminProductReview.service.js";

const REVIEW_STATUS_VALUES = Object.values(ReviewStatus) as string[];

function parseStatusFilter(raw: unknown): ReviewStatus | "all" | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return undefined;
  if (value === "all") return "all";
  return REVIEW_STATUS_VALUES.includes(value) ? (value as ReviewStatus) : undefined;
}

export async function listAdminReviewsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const statusFilter = parseStatusFilter(req.query.status);
    const reviews = await listReviewsForAdmin(statusFilter);
    sendSuccess(res, { message: "Reviews retrieved successfully", data: { reviews } });
  } catch (error) {
    next(error);
  }
}

export async function approveReviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Review id is required", statusCode: 400 });
      return;
    }
    const review = await approveReview(id);
    sendSuccess(res, { message: "Review approved and is now public.", data: review });
  } catch (error) {
    if (error instanceof AdminProductReviewError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function rejectReviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Review id is required", statusCode: 400 });
      return;
    }
    const review = await rejectReview(id);
    sendSuccess(res, { message: "Review rejected.", data: review });
  } catch (error) {
    if (error instanceof AdminProductReviewError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
