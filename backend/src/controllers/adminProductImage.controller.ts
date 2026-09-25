// Version 7, Milestone 69: admin product image endpoints. Kept
// separate from adminProduct.controller.ts (product text/price/stock)
// for the same reason that file is kept separate from
// adminDashboard.controller.ts — an independent, easy-to-review write
// path.
//
// Version 7, Milestone 74 adds deleteAdminProductImageHandler — single-
// image delete only, still no bulk delete route and no route that
// touches the Product row itself.

import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as adminProductImageService from "../services/adminProductImage.service.js";
import { AdminProductImageError } from "../services/adminProductImage.service.js";
import { ProductImageStorageError } from "../services/supabaseStorage.service.js";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — kept in sync with adminProductImage.service.ts

// Memory storage only — never written to disk, even temporarily. The
// buffer is handed straight to Supabase Storage and then discarded;
// nothing about an uploaded file is ever persisted locally.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

// Exported so the route file can wire it up as middleware ahead of the
// handler below — kept here, next to the handler that consumes
// req.file, rather than in the route file, so the two stay in sync.
export const uploadProductImageMiddleware = upload.single("image");

function handleKnownErrors(res: Response, error: unknown): boolean {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      sendError(res, { message: "Image file is too large. Maximum size is 5 MB.", statusCode: 400 });
      return true;
    }
    sendError(res, { message: "Image upload failed. Please try a different file.", statusCode: 400 });
    return true;
  }
  if (error instanceof AdminProductImageError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return true;
  }
  if (error instanceof ProductImageStorageError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return true;
  }
  return false;
}

export async function listAdminProductImagesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Product id is required", statusCode: 400 });
      return;
    }

    const images = await adminProductImageService.listProductImages(id);
    sendSuccess(res, { message: "Product images retrieved successfully", data: { images } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function uploadAdminProductImageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Product id is required", statusCode: 400 });
      return;
    }

    const file = req.file;
    if (!file) {
      sendError(res, { message: "An image file is required (field name: image).", statusCode: 400 });
      return;
    }

    const image = await adminProductImageService.uploadImageForProduct({
      productId: id,
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
      originalName: file.originalname,
      altText: req.body?.altText,
      kind: req.body?.kind,
    });

    sendSuccess(res, { message: "Image uploaded successfully", statusCode: 201, data: image });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function updateAdminProductImageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, imageId } = req.params;
    if (!id || !imageId) {
      sendError(res, { message: "Product id and image id are required", statusCode: 400 });
      return;
    }

    const result = await adminProductImageService.updateProductImage(id, imageId, req.body ?? {});
    sendSuccess(res, { message: "Image updated successfully", data: result });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function deleteAdminProductImageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, imageId } = req.params;
    if (!id || !imageId) {
      sendError(res, { message: "Product id and image id are required", statusCode: 400 });
      return;
    }

    const result = await adminProductImageService.deleteProductImage(id, imageId);
    sendSuccess(res, { message: "Image removed successfully", data: result });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Milestone 197: variant-scoped image endpoints. Same handlers/middleware
// discipline as the product-level ones above, with an extra variantId
// path segment — the service layer (requireVariantBelongsToProduct)
// is what actually enforces that variantId genuinely belongs to
// product id, never trusted from the URL alone.
// ---------------------------------------------------------------------------

export async function listAdminVariantImagesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, variantId } = req.params;
    if (!id || !variantId) {
      sendError(res, { message: "Product id and variant id are required", statusCode: 400 });
      return;
    }

    const images = await adminProductImageService.listVariantImages(id, variantId);
    sendSuccess(res, { message: "Variant images retrieved successfully", data: { images } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function uploadAdminVariantImageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, variantId } = req.params;
    if (!id || !variantId) {
      sendError(res, { message: "Product id and variant id are required", statusCode: 400 });
      return;
    }

    const file = req.file;
    if (!file) {
      sendError(res, { message: "An image file is required (field name: image).", statusCode: 400 });
      return;
    }

    const image = await adminProductImageService.uploadImageForVariant({
      productId: id,
      variantId,
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
      originalName: file.originalname,
      altText: req.body?.altText,
    });

    sendSuccess(res, { message: "Image uploaded successfully", statusCode: 201, data: image });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function updateAdminVariantImageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, variantId, imageId } = req.params;
    if (!id || !variantId || !imageId) {
      sendError(res, { message: "Product id, variant id and image id are required", statusCode: 400 });
      return;
    }

    const result = await adminProductImageService.updateVariantImage(id, variantId, imageId, req.body ?? {});
    sendSuccess(res, { message: "Image updated successfully", data: result });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function deleteAdminVariantImageHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id, variantId, imageId } = req.params;
    if (!id || !variantId || !imageId) {
      sendError(res, { message: "Product id, variant id and image id are required", statusCode: 400 });
      return;
    }

    const result = await adminProductImageService.deleteVariantImage(id, variantId, imageId);
    sendSuccess(res, { message: "Image removed successfully", data: result });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}
