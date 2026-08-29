// Content Studio Phase 2: thin handlers only — all business logic and
// validation lives in brandKnowledge.service.ts, same shape as every
// other admin controller in this backend (e.g.
// adminReferralAffiliate.controller.ts). Write routes are additionally
// gated by requireAdminRole("ADMIN") at the router level; every
// handler here still trusts req.adminUser exactly as it's given, never
// re-deriving a role from request input.

import type { NextFunction, Request, Response } from "express";
import { BrandKnowledgeCategory } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam, parseStringParam } from "../utils/query.js";
import * as brandKnowledgeService from "../services/brandKnowledge.service.js";
import { BrandKnowledgeError } from "../services/brandKnowledge.service.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

function parsePage(raw: unknown): number {
  return parsePositiveIntParam(raw) ?? 1;
}

function parseLimit(raw: unknown): number {
  return Math.min(parsePositiveIntParam(raw) ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
}

function parseCategoryFilter(raw: unknown): BrandKnowledgeCategory | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(BrandKnowledgeCategory) as string[]).includes(value) ? (value as BrandKnowledgeCategory) : undefined;
}

function parseActiveFilter(raw: unknown): boolean | undefined {
  const value = parseStringParam(raw);
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function handleServiceError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof BrandKnowledgeError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  next(error);
}

export async function listBrandKnowledgeEntriesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await brandKnowledgeService.listBrandKnowledgeEntriesForAdmin({
      page: parsePage(req.query.page),
      limit: parseLimit(req.query.limit),
      category: parseCategoryFilter(req.query.category),
      isActive: parseActiveFilter(req.query.isActive),
      search: parseStringParam(req.query.search),
      tag: parseStringParam(req.query.tag),
    });
    sendSuccess(res, { message: "Brand knowledge entries retrieved successfully", data: result });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function getBrandKnowledgeEntryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Entry id is required", statusCode: 400 });
      return;
    }
    const entry = await brandKnowledgeService.getBrandKnowledgeEntryForAdmin(id);
    if (!entry) {
      sendError(res, { message: `No brand knowledge entry found with id "${id}".`, statusCode: 404 });
      return;
    }
    sendSuccess(res, { message: "Brand knowledge entry retrieved successfully", data: entry });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function createBrandKnowledgeEntryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const entry = await brandKnowledgeService.createBrandKnowledgeEntry(req.body, req.adminUser?.id ?? null);
    sendSuccess(res, { message: "Brand knowledge entry created successfully", data: entry, statusCode: 201 });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function updateBrandKnowledgeEntryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Entry id is required", statusCode: 400 });
      return;
    }
    const entry = await brandKnowledgeService.updateBrandKnowledgeEntry(id, req.body, req.adminUser?.id ?? null);
    sendSuccess(res, { message: "Brand knowledge entry updated successfully", data: entry });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function deactivateBrandKnowledgeEntryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Entry id is required", statusCode: 400 });
      return;
    }
    const entry = await brandKnowledgeService.setBrandKnowledgeEntryActive(id, false, req.adminUser?.id ?? null);
    sendSuccess(res, { message: "Brand knowledge entry deactivated successfully", data: entry });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}

export async function reactivateBrandKnowledgeEntryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Entry id is required", statusCode: 400 });
      return;
    }
    const entry = await brandKnowledgeService.setBrandKnowledgeEntryActive(id, true, req.adminUser?.id ?? null);
    sendSuccess(res, { message: "Brand knowledge entry reactivated successfully", data: entry });
  } catch (error) {
    handleServiceError(error, res, next);
  }
}
