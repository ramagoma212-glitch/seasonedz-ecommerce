// Milestone 182: admin endpoints for the Zeely Campaign Brief tool.
// Same discipline as adminProduct.controller.ts/adminPreorder.controller.ts
// — the controller only parses query params and relays req.adminUser,
// every real validation/business rule lives in campaignBrief.service.ts.

import type { NextFunction, Request, Response } from "express";
import { CampaignBriefStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam } from "../utils/query.js";
import * as campaignBriefService from "../services/campaignBrief.service.js";
import { CampaignBriefError } from "../services/campaignBrief.service.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

function parseStatusFilter(raw: unknown): CampaignBriefStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(CampaignBriefStatus) as string[]).includes(value) ? (value as CampaignBriefStatus) : undefined;
}

export async function listCampaignBriefsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parsePositiveIntParam(req.query.page) ?? 1;
    const limit = Math.min(parsePositiveIntParam(req.query.limit) ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    const status = parseStatusFilter(req.query.status);
    const result = await campaignBriefService.listCampaignBriefsForAdmin({ page, limit, status });
    sendSuccess(res, { message: "Campaign briefs retrieved successfully.", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getCampaignBriefHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const brief = await campaignBriefService.getCampaignBriefForAdmin(req.params.id as string);
    if (!brief) {
      sendError(res, { message: `Campaign brief not found: ${req.params.id}`, statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Campaign brief retrieved successfully.", data: brief });
  } catch (error) {
    next(error);
  }
}

export async function createCampaignBriefHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const brief = await campaignBriefService.createCampaignBrief(req.body ?? {}, req.adminUser?.id ?? null);
    sendSuccess(res, { message: "Campaign brief generated successfully.", statusCode: 201, data: brief });
  } catch (error) {
    if (error instanceof CampaignBriefError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function updateCampaignBriefHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const brief = await campaignBriefService.updateCampaignBrief(req.params.id as string, req.body ?? {}, req.adminUser?.id ?? null);
    sendSuccess(res, { message: "Campaign brief updated successfully.", data: brief });
  } catch (error) {
    if (error instanceof CampaignBriefError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function regenerateCampaignBriefHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const brief = await campaignBriefService.regenerateCampaignBrief(req.params.id as string, req.adminUser?.id ?? null);
    sendSuccess(res, { message: "Campaign brief regenerated successfully.", data: brief });
  } catch (error) {
    if (error instanceof CampaignBriefError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function updateCampaignBriefStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = (req.body ?? {}) as { status?: unknown };
    const brief = await campaignBriefService.updateCampaignBriefStatus(req.params.id as string, body.status, req.adminUser?.id ?? null);
    sendSuccess(res, { message: "Campaign brief status updated successfully.", data: brief });
  } catch (error) {
    if (error instanceof CampaignBriefError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function archiveCampaignBriefHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const brief = await campaignBriefService.archiveCampaignBrief(req.params.id as string, req.adminUser?.id ?? null);
    sendSuccess(res, { message: "Campaign brief archived successfully.", data: brief });
  } catch (error) {
    if (error instanceof CampaignBriefError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function createCampaignContentRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await campaignBriefService.createCampaignContentRecord(req.params.id as string, req.body ?? {}, req.adminUser?.id ?? null);
    sendSuccess(res, { message: "Content record created successfully.", statusCode: 201, data: record });
  } catch (error) {
    if (error instanceof CampaignBriefError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function updateCampaignContentRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const record = await campaignBriefService.updateCampaignContentRecord(req.params.recordId as string, req.body ?? {});
    sendSuccess(res, { message: "Content record updated successfully.", data: record });
  } catch (error) {
    if (error instanceof CampaignBriefError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function deleteCampaignContentRecordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await campaignBriefService.deleteCampaignContentRecord(req.params.recordId as string);
    sendSuccess(res, { message: "Content record deleted successfully.", data: null });
  } catch (error) {
    if (error instanceof CampaignBriefError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
