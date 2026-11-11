// Milestone 205: public, read-only delivery settings — lets the
// storefront (cart free-delivery progress bar, per-product delivery
// line) show the real, currently-configured fees/threshold instead of
// a hardcoded frontend constant that could silently drift from what
// the admin actually set. Mirrors preorder.controller.ts's
// getPublicPreorderSettingsHandler exactly. No auth — these are not
// secret, the same way the fee/threshold rule was always visible in
// the plain config/delivery.ts constants before Milestone 205.

import type { NextFunction, Request, Response } from "express";
import { sendSuccess } from "../utils/apiResponse.js";
import { getDeliverySettings } from "../services/deliverySettings.service.js";
import { timed } from "../utils/serverTiming.js";

export async function getPublicDeliverySettingsHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await timed(res, "db", () => getDeliverySettings());
    sendSuccess(res, {
      message: "Delivery settings retrieved successfully",
      data: {
        courierLockerFee: settings.courierLockerFee,
        courierDoorFee: settings.courierDoorFee,
        freeDeliveryThreshold: settings.freeDeliveryThreshold,
      },
    });
  } catch (error) {
    next(error);
  }
}
