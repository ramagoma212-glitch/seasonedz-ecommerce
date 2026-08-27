// Version 7, Milestone 176: admin affiliate application review
// endpoints. Thin handlers only — all business logic lives in
// adminAffiliateApplication.service.ts. Mounted behind requireAdminAuth
// at the router level (adminAffiliateApplications.routes.ts), same
// discipline as every other admin router in this backend.

import type { NextFunction, Request, Response } from "express";
import { AffiliateApplicationStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam, parseStringParam } from "../utils/query.js";
import { AdminAffiliateApplicationError, approveApplication, getApplicationDetail, getApplicationEvents, getApplicationStatusCounts, getSignedUrlForAdminDocument, listApplications, rejectApplication, requestCorrection, revealApplicationIdentityNumber } from "../services/adminAffiliateApplication.service.js";
import { AffiliateDocumentStorageError } from "../services/affiliateDocumentStorage.service.js";
import { ReferralAffiliateError } from "../services/referralAffiliate.service.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

function parsePage(raw: unknown): number {
  return parsePositiveIntParam(raw) ?? 1;
}

function parseLimit(raw: unknown): number {
  const requested = parsePositiveIntParam(raw) ?? DEFAULT_LIST_LIMIT;
  return Math.min(requested, MAX_LIST_LIMIT);
}

function parseStatusFilter(raw: unknown): AffiliateApplicationStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(AffiliateApplicationStatus) as string[]).includes(value) ? (value as AffiliateApplicationStatus) : undefined;
}

function handleServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof AdminAffiliateApplicationError || error instanceof ReferralAffiliateError || error instanceof AffiliateDocumentStorageError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  next(error);
}

export async function listApplicationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const status = parseStatusFilter(req.query.status);
    const search = parseStringParam(req.query.search);

    const result = await listApplications({ page, limit, status, search });
    sendSuccess(res, { message: "Affiliate applications retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getApplicationsOverviewHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const statusCounts = await getApplicationStatusCounts();
    const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
    sendSuccess(res, { message: "Affiliate applications overview retrieved successfully", data: { total, statusCounts } });
  } catch (error) {
    next(error);
  }
}

export async function getApplicationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Application id is required", statusCode: 400 });
      return;
    }
    const application = await getApplicationDetail(id);
    sendSuccess(res, { message: "Application retrieved successfully", data: { application } });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function getApplicationEventsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Application id is required", statusCode: 400 });
      return;
    }
    const events = await getApplicationEvents(id);
    sendSuccess(res, { message: "Application history retrieved successfully", data: { events } });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function revealIdentityNumberHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Application id is required", statusCode: 400 });
      return;
    }
    const identityNumber = await revealApplicationIdentityNumber(id, req.adminUser.id);
    sendSuccess(res, { message: "Identity number retrieved successfully", data: { identityNumber } });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function getDocumentSignedUrlHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const { id, documentId } = req.params;
    if (!id || !documentId) {
      sendError(res, { message: "Application id and document id are required", statusCode: 400 });
      return;
    }
    const signedUrl = await getSignedUrlForAdminDocument(id, documentId, req.adminUser.id);
    sendSuccess(res, { message: "Signed document URL generated successfully", data: { signedUrl } });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function requestCorrectionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Application id is required", statusCode: 400 });
      return;
    }
    const application = await requestCorrection(id, req.body?.reason, req.body?.area, req.adminUser.id);
    sendSuccess(res, { message: "Correction requested successfully", data: { application } });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function approveApplicationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Application id is required", statusCode: 400 });
      return;
    }
    const application = await approveApplication(id, req.adminUser.id);
    sendSuccess(res, { message: "Application approved successfully", data: { application } });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function rejectApplicationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Application id is required", statusCode: 400 });
      return;
    }
    const application = await rejectApplication(id, req.body?.reason, req.adminUser.id);
    sendSuccess(res, { message: "Application rejected successfully", data: { application } });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}
