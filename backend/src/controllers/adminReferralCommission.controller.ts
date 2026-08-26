// Version 7, Milestone 172B.3: read-only admin foundation for
// OrderAffiliateCommission.
//
// Version 7, Milestone 172B.5: the real lifecycle — approve/reverse/pay
// handlers, plus payout overview. Thin handlers only; every business
// rule (eligibility, transition validity, minimum payout threshold,
// concurrency safety) lives in referralCommission.service.ts, never
// here or on the frontend — see that file's own header comment.

import type { NextFunction, Request, Response } from "express";
import { OrderAffiliateCommissionStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam, parseStringParam } from "../utils/query.js";
import * as referralCommissionService from "../services/referralCommission.service.js";
import { CommissionLifecycleError } from "../services/referralCommission.service.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

function parsePage(raw: unknown): number {
  return parsePositiveIntParam(raw) ?? 1;
}

function parseLimit(raw: unknown): number {
  const requested = parsePositiveIntParam(raw) ?? DEFAULT_LIST_LIMIT;
  return Math.min(requested, MAX_LIST_LIMIT);
}

function parseStatusFilter(raw: unknown): OrderAffiliateCommissionStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(OrderAffiliateCommissionStatus) as string[]).includes(value)
    ? (value as OrderAffiliateCommissionStatus)
    : undefined;
}

function parseBooleanFlag(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === "1";
}

function parseDateParam(raw: unknown): Date | undefined {
  const value = parseStringParam(raw);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// Never trusts requireAdminAuth's own presence alone — every handler
// here explicitly re-checks req.adminUser before doing anything, same
// defensive discipline as adminOrderStatus.controller.ts/
// adminCourier.controller.ts, since a lifecycle action must never run
// with an undefined acting-admin identity.
function requireAdmin(req: Request, res: Response): NonNullable<Request["adminUser"]> | null {
  if (!req.adminUser) {
    sendError(res, { message: "Authentication required.", statusCode: 401 });
    return null;
  }
  return req.adminUser;
}

function handleServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof CommissionLifecycleError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  next(error);
}

export async function listOrderAffiliateCommissionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const status = parseStatusFilter(req.query.status);
    const eligibleOnly = parseBooleanFlag(req.query.eligibleOnly);
    const affiliateId = parseStringParam(req.query.affiliateId);
    const fromDate = parseDateParam(req.query.fromDate);
    const toDate = parseDateParam(req.query.toDate);

    const result = await referralCommissionService.listOrderAffiliateCommissions({ page, limit, status, eligibleOnly, affiliateId, fromDate, toDate });
    sendSuccess(res, { message: "Referral commissions retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getOrderAffiliateCommissionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Commission id is required", statusCode: 400 });
      return;
    }

    const commission = await referralCommissionService.getOrderAffiliateCommissionDetail(id);
    if (!commission) {
      sendError(res, { message: `Commission not found: ${id}`, statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Commission retrieved successfully", data: commission });
  } catch (error) {
    next(error);
  }
}

export async function approveCommissionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Commission id is required", statusCode: 400 });
      return;
    }

    const commission = await referralCommissionService.approveCommission(id, admin);
    sendSuccess(res, { message: "Commission approved successfully", data: commission });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function reverseCommissionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Commission id is required", statusCode: 400 });
      return;
    }

    const body = (req.body ?? {}) as { reason?: unknown; confirmClawback?: unknown };
    const confirmClawback = body.confirmClawback === true;

    const commission = await referralCommissionService.reverseCommission(id, body.reason, confirmClawback, admin);
    sendSuccess(res, { message: "Commission reversed successfully", data: commission });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function getPayoutOverviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const overview = await referralCommissionService.getPayoutOverview();
    sendSuccess(res, { message: "Payout overview retrieved successfully", data: overview });
  } catch (error) {
    next(error);
  }
}

export async function payAffiliateCommissionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const { affiliateId } = req.params;
    if (!affiliateId) {
      sendError(res, { message: "Affiliate id is required", statusCode: 400 });
      return;
    }

    const body = (req.body ?? {}) as { commissionIds?: unknown };
    const commissionIds =
      Array.isArray(body.commissionIds) && body.commissionIds.every((entry) => typeof entry === "string") ? (body.commissionIds as string[]) : undefined;

    const result = await referralCommissionService.payAffiliateCommissions(affiliateId, commissionIds, admin);
    sendSuccess(res, { message: "Commissions marked as paid successfully", data: result });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}
