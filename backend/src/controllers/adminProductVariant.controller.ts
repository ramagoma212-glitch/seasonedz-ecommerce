// Milestone 188: Admin Managed Product Variations — write endpoints for
// ProductVariant rows. Kept separate from adminProduct.controller.ts,
// same reasoning that file already documents for its own separation
// from adminDashboard.controller.ts.

import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as adminProductVariantService from "../services/adminProductVariant.service.js";
import { AdminProductError } from "../services/adminProduct.service.js";

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function requireProductId(req: Request, res: Response): string | null {
  const { id } = req.params;
  if (!id) {
    sendError(res, { message: "Product id is required", statusCode: 400 });
    return null;
  }
  return id;
}

export async function generateVariationsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const productId = requireProductId(req, res);
    if (!productId) return;

    const result = await adminProductVariantService.generateVariations(productId, req.body ?? {});
    sendSuccess(res, {
      message: result.created > 0 ? `${result.created} new variant(s) generated` : "No new variant combinations to generate",
      data: result.product,
    });
  } catch (error) {
    if (error instanceof AdminProductError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function createVariantHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const productId = requireProductId(req, res);
    if (!productId) return;

    const product = await adminProductVariantService.createVariant(productId, req.body ?? {});
    sendSuccess(res, { message: "Variant created successfully", statusCode: 201, data: product });
  } catch (error) {
    if (error instanceof AdminProductError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    if (isPrismaUniqueConstraintError(error)) {
      sendError(res, { message: "A variant with this SKU already exists.", statusCode: 409 });
      return;
    }
    next(error);
  }
}

export async function updateVariantHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const productId = requireProductId(req, res);
    if (!productId) return;
    const { variantId } = req.params;
    if (!variantId) {
      sendError(res, { message: "Variant id is required", statusCode: 400 });
      return;
    }

    const product = await adminProductVariantService.updateVariant(productId, variantId, req.body ?? {});
    sendSuccess(res, { message: "Variant updated successfully", data: product });
  } catch (error) {
    if (error instanceof AdminProductError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    if (isPrismaUniqueConstraintError(error)) {
      sendError(res, { message: "A variant with this SKU already exists.", statusCode: 409 });
      return;
    }
    next(error);
  }
}

export async function removeVariantHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const productId = requireProductId(req, res);
    if (!productId) return;
    const { variantId } = req.params;
    if (!variantId) {
      sendError(res, { message: "Variant id is required", statusCode: 400 });
      return;
    }

    const product = await adminProductVariantService.removeVariant(productId, variantId);
    sendSuccess(res, { message: "Variant removed successfully", data: product });
  } catch (error) {
    if (error instanceof AdminProductError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
