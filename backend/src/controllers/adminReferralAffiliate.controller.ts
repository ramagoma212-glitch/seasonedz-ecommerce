// Version 7, Milestone 172B.3: admin management of Seasonedz's own
// affiliate/referral programme's Affiliate records. Thin handlers only
// — all business logic lives in referralAffiliate.service.ts, same
// shape as adminAffiliateProduct.controller.ts (172B).

import type { NextFunction, Request, Response } from "express";
import { Prisma, AffiliateStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam, parseStringParam } from "../utils/query.js";
import * as referralAffiliateService from "../services/referralAffiliate.service.js";
import { ReferralAffiliateError } from "../services/referralAffiliate.service.js";
import { getAffiliateCommissionTotals, getCommissionOverviewStats } from "../services/referralCommission.service.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

function parsePage(raw: unknown): number {
  return parsePositiveIntParam(raw) ?? 1;
}

function parseLimit(raw: unknown): number {
  const requested = parsePositiveIntParam(raw) ?? DEFAULT_LIST_LIMIT;
  return Math.min(requested, MAX_LIST_LIMIT);
}

// Same forgiving convention as every other admin list filter in this
// backend — an unrecognised or absent status means "no filter", never
// an error.
function parseStatusFilter(raw: unknown): AffiliateStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(AffiliateStatus) as string[]).includes(value) ? (value as AffiliateStatus) : undefined;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function handleServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ReferralAffiliateError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  if (isPrismaUniqueConstraintError(error)) {
    sendError(res, { message: "This email, referral code, or linked customer is already in use by another affiliate.", statusCode: 409 });
    return;
  }
  next(error);
}

export async function listAffiliatesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const status = parseStatusFilter(req.query.status);
    const search = parseStringParam(req.query.search);

    const result = await referralAffiliateService.listAffiliates({ page, limit, status, search });
    sendSuccess(res, { message: "Affiliates retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getAffiliateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate id is required", statusCode: 400 });
      return;
    }

    const affiliate = await referralAffiliateService.getAffiliate(id);
    if (!affiliate) {
      sendError(res, { message: `Affiliate not found: ${id}`, statusCode: 404 });
      return;
    }

    // Version 7, Milestone 172B.5: real commission totals merged in —
    // same "small, separately-queried augmentation" pattern used
    // throughout this backend (e.g. adminDashboard.controller.ts's
    // courier fields). Never fabricated; all zero for an affiliate with
    // no commissions yet.
    const commissionTotals = await getAffiliateCommissionTotals(id);

    sendSuccess(res, { message: "Affiliate retrieved successfully", data: { ...affiliate, commissionTotals } });
  } catch (error) {
    next(error);
  }
}

export async function createAffiliateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const affiliate = await referralAffiliateService.createAffiliate(req.body ?? {});
    sendSuccess(res, { message: "Affiliate created successfully", statusCode: 201, data: affiliate });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function updateAffiliateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate id is required", statusCode: 400 });
      return;
    }

    const affiliate = await referralAffiliateService.updateAffiliate(id, req.body ?? {});
    sendSuccess(res, { message: "Affiliate updated successfully", data: affiliate });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function approveAffiliateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate id is required", statusCode: 400 });
      return;
    }

    const affiliate = await referralAffiliateService.approveAffiliate(id);
    sendSuccess(res, { message: "Affiliate approved successfully", data: affiliate });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function rejectAffiliateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate id is required", statusCode: 400 });
      return;
    }

    const affiliate = await referralAffiliateService.rejectAffiliate(id);
    sendSuccess(res, { message: "Affiliate rejected successfully", data: affiliate });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function suspendAffiliateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate id is required", statusCode: 400 });
      return;
    }

    const affiliate = await referralAffiliateService.suspendAffiliate(id);
    sendSuccess(res, { message: "Affiliate suspended successfully", data: affiliate });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function reactivateAffiliateHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate id is required", statusCode: 400 });
      return;
    }

    const affiliate = await referralAffiliateService.reactivateAffiliate(id);
    sendSuccess(res, { message: "Affiliate reactivated successfully", data: affiliate });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

// Affiliate counts were structural-only (172B.3); Milestone 172B.5
// added real commission figures alongside them — every value here is a
// genuine database aggregate (referralCommission.service.ts's
// getCommissionOverviewStats()), never a fabricated click/sale figure.
export async function getReferralsOverviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [statusCounts, commissionStats] = await Promise.all([referralAffiliateService.getAffiliateStatusCounts(), getCommissionOverviewStats()]);
    const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    sendSuccess(res, {
      message: "Referrals overview retrieved successfully",
      data: {
        totalAffiliates: total,
        pendingAffiliates: statusCounts.PENDING,
        activeAffiliates: statusCounts.ACTIVE,
        suspendedAffiliates: statusCounts.SUSPENDED,
        rejectedAffiliates: statusCounts.REJECTED,
        ...commissionStats,
      },
    });
  } catch (error) {
    next(error);
  }
}
