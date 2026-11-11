// Milestone 205: admin GET/PATCH for the delivery settings singleton
// row — deliberately no POST/create handler exists anywhere in this
// file or its route, so there is no way to ever end up with a second
// settings row through the API. Mirrors
// adminReferralSettings.controller.ts exactly.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import * as deliverySettingsService from "../services/deliverySettings.service.js";
import { DeliverySettingsError } from "../services/deliverySettings.service.js";

export async function getDeliverySettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await deliverySettingsService.getDeliverySettings();
    sendSuccess(res, { message: "Delivery settings retrieved successfully", data: settings });
  } catch (error) {
    next(error);
  }
}

export async function updateDeliverySettingsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminUserId = req.adminUser?.id ?? null;
    const settings = await deliverySettingsService.updateDeliverySettings(req.body ?? {}, adminUserId);
    sendSuccess(res, { message: "Delivery settings updated successfully", data: settings });
  } catch (error) {
    if (error instanceof DeliverySettingsError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
