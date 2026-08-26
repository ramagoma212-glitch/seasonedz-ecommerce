// Version 7, Milestone 172B.4: public, unauthenticated handlers for
// GET /api/referrals/capture and /preview — see routes/referrals.routes.ts
// and services/referralCapture.service.ts. No requireAdminAuth anywhere
// in this file; deliberately separate from every admin referral
// controller (controllers/adminReferral*.controller.ts).

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { captureReferral, previewReferral, ReferralCaptureError } from "../services/referralCapture.service.js";
import { ReferralAffiliateError } from "../services/referralAffiliate.service.js";

export async function captureReferralHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await captureReferral(req.query.code);
    sendSuccess(res, { message: "Referral captured", data: result });
  } catch (error) {
    if (error instanceof ReferralCaptureError || error instanceof ReferralAffiliateError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function previewReferralHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await previewReferral(req.query.code, req.query.capturedAt, req.query.signature);
    sendSuccess(res, { message: "Referral preview", data: result });
  } catch (error) {
    next(error);
  }
}
