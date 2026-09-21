// Milestone 189: admin welcome-gift asset endpoints. Kept separate from
// adminDigitalAsset.controller.ts, same reasoning as that file's own
// separation from adminProduct.controller.ts.

import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as adminWelcomeGiftAssetService from "../services/adminWelcomeGiftAsset.service.js";
import { AdminWelcomeGiftAssetError } from "../services/adminWelcomeGiftAsset.service.js";
import { DigitalAssetStorageError } from "../services/digitalAssetStorage.service.js";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
});

export const uploadWelcomeGiftAssetMiddleware = upload.single("file");

function handleKnownErrors(res: Response, error: unknown): boolean {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      sendError(res, { message: "File is too large. Maximum size is 50 MB.", statusCode: 400 });
      return true;
    }
    sendError(res, { message: "File upload failed. Please try a different file.", statusCode: 400 });
    return true;
  }
  if (error instanceof AdminWelcomeGiftAssetError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return true;
  }
  if (error instanceof DigitalAssetStorageError) {
    sendError(res, { message: error.message, statusCode: error.statusCode });
    return true;
  }
  return false;
}

export async function listWelcomeGiftAssetsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const assets = await adminWelcomeGiftAssetService.listWelcomeGiftAssets();
    sendSuccess(res, { message: "Welcome-gift assets retrieved successfully.", data: { assets } });
  } catch (error) {
    next(error);
  }
}

export async function uploadWelcomeGiftAssetHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { assetKey } = req.params;
    if (!assetKey) {
      sendError(res, { message: "Asset key is required.", statusCode: 400 });
      return;
    }

    const file = req.file;
    if (!file) {
      sendError(res, { message: "A file is required (field name: file).", statusCode: 400 });
      return;
    }

    const asset = await adminWelcomeGiftAssetService.uploadWelcomeGiftAsset({
      assetKey,
      buffer: file.buffer,
      mimetype: file.mimetype,
      size: file.size,
      originalName: file.originalname,
    });

    sendSuccess(res, { message: "Welcome-gift sample uploaded successfully.", statusCode: 201, data: { asset } });
  } catch (error) {
    if (handleKnownErrors(res, error)) return;
    next(error);
  }
}
