// Version 7, Milestone 172B.3: admin GET/PATCH for the affiliate
// programme's singleton settings row — deliberately no POST/create
// handler exists anywhere in this file or its route (§8: "not generic
// POST/create settings"), so there is no way to ever end up with a
// second settings row through the API.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as referralProgrammeSettingsService from "../services/referralProgrammeSettings.service.js";
import { ReferralProgrammeSettingsError } from "../services/referralProgrammeSettings.service.js";

export async function getReferralSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await referralProgrammeSettingsService.getReferralProgrammeSettings();
    sendSuccess(res, { message: "Referral programme settings retrieved successfully", data: settings });
  } catch (error) {
    next(error);
  }
}

export async function updateReferralSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminUserId = req.adminUser?.id ?? null;
    const settings = await referralProgrammeSettingsService.updateReferralProgrammeSettings(req.body ?? {}, adminUserId);
    sendSuccess(res, { message: "Referral programme settings updated successfully", data: settings });
  } catch (error) {
    if (error instanceof ReferralProgrammeSettingsError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
