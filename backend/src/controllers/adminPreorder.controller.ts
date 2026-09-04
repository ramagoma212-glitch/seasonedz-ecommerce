// Milestone 181, Part D: admin GET/PATCH for the preorder programme's
// singleton settings row — same discipline as
// adminReferralSettings.controller.ts (deliberately no POST/create
// handler, so there is no way to ever end up with a second settings
// row through the API). PATCH is ADMIN-only at the route level (see
// adminPreorder.routes.ts) — "Only ADMIN may modify programme-level
// financial settings" (brief Part D); GET is reachable by any
// authenticated admin (STAFF may view).

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { getPreorderProgrammeSettings, updatePreorderProgrammeSettings, PreorderProgrammeSettingsError } from "../services/preorderProgrammeSettings.service.js";

export async function getPreorderSettingsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await getPreorderProgrammeSettings();
    sendSuccess(res, { message: "Preorder programme settings retrieved successfully.", data: settings });
  } catch (error) {
    next(error);
  }
}

export async function updatePreorderSettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminUserId = req.adminUser?.id ?? null;
    const settings = await updatePreorderProgrammeSettings(req.body ?? {}, adminUserId);
    sendSuccess(res, { message: "Preorder programme settings updated successfully.", data: settings });
  } catch (error) {
    if (error instanceof PreorderProgrammeSettingsError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
