import type { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import { previewWelcomeGiftBulkSend, runWelcomeGiftBulkSend } from "../services/adminWelcomeGiftBulkSend.service.js";

export async function previewWelcomeGiftBulkSendHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const preview = await previewWelcomeGiftBulkSend();
    sendSuccess(res, { message: "Welcome-gift bulk-send preview generated.", data: preview });
  } catch (error) {
    next(error);
  }
}

export async function runWelcomeGiftBulkSendHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await runWelcomeGiftBulkSend();
    sendSuccess(res, { message: "Welcome-gift bulk send completed.", data: result });
  } catch (error) {
    next(error);
  }
}
