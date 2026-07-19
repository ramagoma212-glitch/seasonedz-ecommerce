// Version 7, Milestone 66: admin product management endpoints. Kept
// separate from the read-only adminDashboard.controller.ts, same
// reasoning as adminOrderStatus.controller.ts — the write path (create/
// update) should be easy to find and review on its own. No DELETE
// handler exists in this file, by design (see
// VERSION_7_PRODUCT_MANAGEMENT_PLAN.md Section 5 — ARCHIVED status is
// the safe alternative to deletion).

import type { NextFunction, Request, Response } from "express";
import { Prisma, ProductStatus } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { parsePositiveIntParam, parseStringParam } from "../utils/query.js";
import * as adminProductService from "../services/adminProduct.service.js";
import { AdminProductError } from "../services/adminProduct.service.js";

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
// (query.ts) and parseOrderStatus (adminDashboard.controller.ts) — an
// unrecognised or absent status value means "no filter", never an
// error, since this is a read-only convenience filter.
function parseProductStatusFilter(raw: unknown): ProductStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (Object.values(ProductStatus) as string[]).includes(value)
    ? (value as ProductStatus)
    : undefined;
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function listAdminProductsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const status = parseProductStatusFilter(req.query.status);
    const categoryId = parseStringParam(req.query.categoryId);
    const search = parseStringParam(req.query.search);

    const result = await adminProductService.listProductsForAdmin({ page, limit, status, categoryId, search });
    sendSuccess(res, { message: "Products retrieved successfully", data: result });
  } catch (error) {
    next(error);
  }
}

export async function getAdminProductHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Product id is required", statusCode: 400 });
      return;
    }

    const product = await adminProductService.getProductForAdmin(id);
    if (!product) {
      sendError(res, { message: `Product not found: ${id}`, statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Product retrieved successfully", data: product });
  } catch (error) {
    next(error);
  }
}

export async function createAdminProductHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await adminProductService.createProduct(req.body ?? {});
    sendSuccess(res, { message: "Product created successfully", statusCode: 201, data: product });
  } catch (error) {
    if (error instanceof AdminProductError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    if (isPrismaUniqueConstraintError(error)) {
      sendError(res, { message: "A product with this slug or SKU already exists.", statusCode: 409 });
      return;
    }
    next(error);
  }
}

export async function updateAdminProductHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Product id is required", statusCode: 400 });
      return;
    }

    const product = await adminProductService.updateProduct(id, req.body ?? {});
    sendSuccess(res, { message: "Product updated successfully", data: product });
  } catch (error) {
    if (error instanceof AdminProductError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    if (isPrismaUniqueConstraintError(error)) {
      sendError(res, { message: "A product with this slug or SKU already exists.", statusCode: 409 });
      return;
    }
    next(error);
  }
}
