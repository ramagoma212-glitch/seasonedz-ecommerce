// Milestone 178, Part C: admin controller for AffiliateProductSetting.
// Mutations are ADMIN-only (requireAdminRole, applied at the route
// level — see adminReferrals.routes.ts); STAFF keeps read access via
// requireAdminAuth alone, the same split Content Studio Phase 2
// established for Brand Knowledge (brief section 22's "STAFF read
// policy consistent with existing referral admin pattern").

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import {
  AffiliateProductSettingError,
  createAffiliateProductSetting,
  deleteAffiliateProductSetting,
  getAffiliateProductSetting,
  listAffiliateProductSettings,
  updateAffiliateProductSetting,
} from "../services/adminAffiliateProductSetting.service.js";

function handleKnownErrors(res: Response, error: unknown): boolean {
  if (error instanceof AffiliateProductSettingError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return true;
  }
  return false;
}

function parsePage(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 100 ? n : 20;
}

export async function listAffiliateProductSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = typeof req.query.search === "string" && req.query.search.trim().length > 0 ? req.query.search.trim() : undefined;
    const result = await listAffiliateProductSettings({ page: parsePage(req.query.page), limit: parseLimit(req.query.limit), search });
    sendSuccess(res, { message: "OK", data: result });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function getAffiliateProductSettingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const item = await getAffiliateProductSetting(req.params.id as string);
    sendSuccess(res, { message: "OK", data: { item } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function createAffiliateProductSettingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const item = await createAffiliateProductSetting(req.body?.productId, req.body ?? {});
    sendSuccess(res, { message: "Product added to the Affiliate Products list", statusCode: 201, data: { item } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function updateAffiliateProductSettingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const item = await updateAffiliateProductSetting(req.params.id as string, req.body ?? {});
    sendSuccess(res, { message: "Affiliate product setting updated", data: { item } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function deleteAffiliateProductSettingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await deleteAffiliateProductSetting(req.params.id as string);
    sendSuccess(res, { message: "Product removed from the Affiliate Products list", data: {} });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}
