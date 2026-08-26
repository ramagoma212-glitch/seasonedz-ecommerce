// Version 7, Milestone 172B.3: read-only admin foundation for
// OrderAffiliateCommission. No create/update/delete handler exists in
// this file — commission rows are only ever produced automatically at
// order-creation time (172B.4) and transitioned by the lifecycle work
// in 172B.5, never typed in directly by an admin. It is expected, and
// correct, for this list to be empty until then.

import type { NextFunction, Request, Response } from "express";
import { OrderAffiliateCommissionStatus } from "@prisma/client";
import { sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam, parseStringParam } from "../utils/query.js";
import * as referralCommissionService from "../services/referralCommission.service.js";

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

function parseDateParam(raw: unknown): Date | undefined {
  const value = parseStringParam(raw);
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function listOrderAffiliateCommissionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const status = parseStatusFilter(req.query.status);
    const affiliateId = parseStringParam(req.query.affiliateId);
    const fromDate = parseDateParam(req.query.fromDate);
    const toDate = parseDateParam(req.query.toDate);

    const result = await referralCommissionService.listOrderAffiliateCommissions({ page, limit, status, affiliateId, fromDate, toDate });
    sendSuccess(res, { message: "Referral commissions retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}
