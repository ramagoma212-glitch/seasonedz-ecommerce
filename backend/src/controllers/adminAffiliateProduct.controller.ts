// Version 7, Milestone 172B: admin affiliate-product management
// endpoints. Same shape as adminProduct.controller.ts — thin handlers,
// all business logic lives in adminAffiliateProduct.service.ts. No
// DELETE handler exists here, by design: isActive=false is the
// removal path, matching the existing Product/ARCHIVED precedent.

import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam, parseStringParam } from "../utils/query.js";
import * as adminAffiliateProductService from "../services/adminAffiliateProduct.service.js";
import { AdminAffiliateProductError } from "../services/adminAffiliateProduct.service.js";

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;

function parsePage(raw: unknown): number {
  return parsePositiveIntParam(raw) ?? 1;
}

function parseLimit(raw: unknown): number {
  const requested = parsePositiveIntParam(raw) ?? DEFAULT_LIST_LIMIT;
  return Math.min(requested, MAX_LIST_LIMIT);
}

// Same forgiving convention as parseSortParam/parseStockParam
// (utils/query.ts) — an unrecognised or absent value means "no
// filter", never an error, since this is a read-only convenience.
function parseActiveFilter(raw: unknown): boolean | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function handleServiceError(error: unknown, res: Response, next: NextFunction, duplicateMessage: string): void {
  if (error instanceof AdminAffiliateProductError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return;
  }
  if (isPrismaUniqueConstraintError(error)) {
    sendError(res, { message: duplicateMessage, statusCode: 409 });
    return;
  }
  next(error);
}

export async function listAdminAffiliateProductsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const isActive = parseActiveFilter(req.query.isActive);
    const search = parseStringParam(req.query.search);

    const result = await adminAffiliateProductService.listAffiliateProductsForAdmin({ page, limit, isActive, search });
    sendSuccess(res, { message: "Affiliate products retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getAdminAffiliateProductHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate product id is required", statusCode: 400 });
      return;
    }

    const product = await adminAffiliateProductService.getAffiliateProductForAdmin(id);
    if (!product) {
      sendError(res, { message: `Affiliate product not found: ${id}`, statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Affiliate product retrieved successfully", data: product });
  } catch (error) {
    next(error);
  }
}

export async function createAdminAffiliateProductHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await adminAffiliateProductService.createAffiliateProduct(req.body ?? {});
    sendSuccess(res, { message: "Affiliate product created successfully", statusCode: 201, data: product });
  } catch (error) {
    handleServiceError(error, res, next, "An affiliate product with this slug or tracking slug already exists.");
  }
}

export async function updateAdminAffiliateProductHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate product id is required", statusCode: 400 });
      return;
    }

    const product = await adminAffiliateProductService.updateAffiliateProduct(id, req.body ?? {});
    sendSuccess(res, { message: "Affiliate product updated successfully", data: product });
  } catch (error) {
    handleServiceError(error, res, next, "An affiliate product with this slug or tracking slug already exists.");
  }
}

export async function activateAdminAffiliateProductHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate product id is required", statusCode: 400 });
      return;
    }

    const product = await adminAffiliateProductService.setAffiliateProductActive(id, true);
    sendSuccess(res, { message: "Affiliate product activated successfully", data: product });
  } catch (error) {
    handleServiceError(error, res, next, "An affiliate product with this slug or tracking slug already exists.");
  }
}

export async function deactivateAdminAffiliateProductHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate product id is required", statusCode: 400 });
      return;
    }

    const product = await adminAffiliateProductService.setAffiliateProductActive(id, false);
    sendSuccess(res, { message: "Affiliate product deactivated successfully", data: product });
  } catch (error) {
    handleServiceError(error, res, next, "An affiliate product with this slug or tracking slug already exists.");
  }
}

export async function featureAdminAffiliateProductHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate product id is required", statusCode: 400 });
      return;
    }

    const product = await adminAffiliateProductService.setAffiliateProductFeatured(id, true);
    sendSuccess(res, { message: "Affiliate product featured successfully", data: product });
  } catch (error) {
    handleServiceError(error, res, next, "An affiliate product with this slug or tracking slug already exists.");
  }
}

export async function unfeatureAdminAffiliateProductHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Affiliate product id is required", statusCode: 400 });
      return;
    }

    const product = await adminAffiliateProductService.setAffiliateProductFeatured(id, false);
    sendSuccess(res, { message: "Affiliate product unfeatured successfully", data: product });
  } catch (error) {
    handleServiceError(error, res, next, "An affiliate product with this slug or tracking slug already exists.");
  }
}
