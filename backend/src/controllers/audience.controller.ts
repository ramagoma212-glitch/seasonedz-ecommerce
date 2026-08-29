// Content Studio Phase 2: thin handlers only — see audience.service.ts
// for all validation/business logic.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parseStringParam } from "../utils/query.js";
import * as audienceService from "../services/audience.service.js";
import { AudienceError } from "../services/audience.service.js";

function parseActiveFilter(raw: unknown): boolean | undefined {
  const value = parseStringParam(raw);
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function handleServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof AudienceError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  next(error);
}

export async function listAudiencesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const audiences = await audienceService.listAudiencesForAdmin({
      isActive: parseActiveFilter(req.query.isActive),
      search: parseStringParam(req.query.search),
    });
    sendSuccess(res, { message: "Audiences retrieved successfully", data: audiences });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function getAudienceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Audience id is required", statusCode: 400 });
      return;
    }
    const audience = await audienceService.getAudienceForAdmin(id);
    if (!audience) {
      sendError(res, { message: `No audience found with id "${id}".`, statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Audience retrieved successfully", data: audience });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function createAudienceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const audience = await audienceService.createAudience(req.body);
    sendSuccess(res, { message: "Audience created successfully", data: audience, statusCode: 201 });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function updateAudienceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Audience id is required", statusCode: 400 });
      return;
    }
    const audience = await audienceService.updateAudience(id, req.body);
    sendSuccess(res, { message: "Audience updated successfully", data: audience });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function deactivateAudienceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Audience id is required", statusCode: 400 });
      return;
    }
    const audience = await audienceService.setAudienceActive(id, false);
    sendSuccess(res, { message: "Audience deactivated successfully", data: audience });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function reactivateAudienceHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Audience id is required", statusCode: 400 });
      return;
    }
    const audience = await audienceService.setAudienceActive(id, true);
    sendSuccess(res, { message: "Audience reactivated successfully", data: audience });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}
