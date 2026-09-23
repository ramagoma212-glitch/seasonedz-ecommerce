// Milestone 181, Part J: public, read-only preorder programme settings
// — lets the storefront show the REAL, currently-configured first-
// preorder discount percentage on a Product page (never a hardcoded
// "10%" that could silently drift from what Preorder Settings actually
// says). No admin auth here at all, unlike adminPreorder.controller.ts's
// GET/PATCH — this exposes nothing sensitive, the same discount rate
// every customer already sees applied (or not) at checkout.

import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import { getPreorderProgrammeSettings } from "../services/preorderProgrammeSettings.service.js";
import { timed } from "../utils/serverTiming.js";

export async function getPublicPreorderSettingsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await timed(res, "db", () => getPreorderProgrammeSettings());
    sendSuccess(res, {
      message: "Preorder programme settings retrieved successfully.",
      data: {
        firstRegisteredPreorderDiscountEnabled: settings.firstRegisteredPreorderDiscountEnabled,
        firstRegisteredPreorderDiscountPercent: settings.firstRegisteredPreorderDiscountPercent,
        // Milestone 181A: exposed so the Product page can state the
        // real, currently-configured minimum — never a hardcoded "R200"
        // that could silently drift from what Preorder Settings says.
        minimumEligiblePreorderSubtotal: settings.minimumEligiblePreorderSubtotal,
      },
    });
  } catch (error) {
    next(error);
  }
}
