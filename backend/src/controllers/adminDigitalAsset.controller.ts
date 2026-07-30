// Version 7, Milestone 152: admin digital-asset (file) endpoints. Kept
// separate from adminProduct.controller.ts, same reasoning as
// adminProductImage.controller.ts.

import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as adminDigitalAssetService from "../services/adminDigitalAsset.service.js";
import { AdminDigitalAssetError } from "../services/adminDigitalAsset.service.js";
import { DigitalAssetStorageError } from "../services/digitalAssetStorage.service.js";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // kept in sync with adminDigitalAsset.service.ts and the Supabase bucket's own 50 MB limit

// Memory storage only, same discipline as product images — never
// written to disk. The buffer is handed to Supabase Storage and then
// discarded.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

export const uploadDigitalAssetMiddleware = upload.single("file");

function handleKnownErrors(res: Response, error: unknown): boolean {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      sendError(res, { message: "File is too large. Maximum size is 50 MB.", statusCode: 400 });
      return true;
    }
    sendError(res, { message: "File upload failed. Please try a different file.", statusCode: 400 });
    return true;
  }
  if (error instanceof AdminDigitalAssetError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return true;
  }
  if (error instanceof DigitalAssetStorageError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return true;
  }
  return false;
}

export async function getAdminDigitalAssetHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Product id is required", statusCode: 400 });
      return;
    }

    const asset = await adminDigitalAssetService.getDigitalAssetForProduct(id);
    sendSuccess(res, { message: "Digital asset retrieved successfully", data: { digitalAsset: asset } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function uploadAdminDigitalAssetHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Product id is required", statusCode: 400 });
      return;
    }

    const file = req.file;
    if (!file) {
      sendError(res, { message: "A file is required (field name: file).", statusCode: 400 });
      return;
    }

    const asset = await adminDigitalAssetService.uploadOrReplaceDigitalAsset({
      productId: id,
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
      originalName: file.originalname,
      displayName: req.body?.displayName,
      pageCount: req.body?.pageCount,
      version: req.body?.version,
    });

    sendSuccess(res, { message: "Digital file uploaded successfully", statusCode: 201, data: { digitalAsset: asset } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}

export async function deleteAdminDigitalAssetHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      sendError(res, { message: "Product id is required", statusCode: 400 });
      return;
    }

    await adminDigitalAssetService.deleteDigitalAsset(id);
    sendSuccess(res, { message: "Digital file removed successfully", data: { deleted: true } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}
