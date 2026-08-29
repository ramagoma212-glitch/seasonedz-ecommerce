// Content Studio Phase 2: thin handlers only — see
// contentPillar.service.ts for all validation/business logic.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parseStringParam } from "../utils/query.js";
import * as contentPillarService from "../services/contentPillar.service.js";
import { ContentPillarError } from "../services/contentPillar.service.js";

function parseActiveFilter(raw: unknown): boolean | undefined {
  const value = parseStringParam(raw);
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function handleServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof ContentPillarError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  next(error);
}

export async function listContentPillarsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const pillars = await contentPillarService.listContentPillarsForAdmin({
      isActive: parseActiveFilter(req.query.isActive),
      search: parseStringParam(req.query.search),
    });
    sendSuccess(res, { message: "Content pillars retrieved successfully", data: pillars });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function getContentPillarHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Pillar id is required", statusCode: 400 });
      return;
    }
    const pillar = await contentPillarService.getContentPillarForAdmin(id);
    if (!pillar) {
      sendError(res, { message: `No content pillar found with id "${id}".`, statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Content pillar retrieved successfully", data: pillar });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function createContentPillarHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const pillar = await contentPillarService.createContentPillar(req.body);
    sendSuccess(res, { message: "Content pillar created successfully", data: pillar, statusCode: 201 });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function updateContentPillarHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Pillar id is required", statusCode: 400 });
      return;
    }
    const pillar = await contentPillarService.updateContentPillar(id, req.body);
    sendSuccess(res, { message: "Content pillar updated successfully", data: pillar });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function deactivateContentPillarHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Pillar id is required", statusCode: 400 });
      return;
    }
    const pillar = await contentPillarService.setContentPillarActive(id, false);
    sendSuccess(res, { message: "Content pillar deactivated successfully", data: pillar });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function reactivateContentPillarHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Pillar id is required", statusCode: 400 });
      return;
    }
    const pillar = await contentPillarService.setContentPillarActive(id, true);
    sendSuccess(res, { message: "Content pillar reactivated successfully", data: pillar });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}
