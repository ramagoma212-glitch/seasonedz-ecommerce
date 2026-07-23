// Version 7, Milestone 106: admin-only manual shipping update. Mounted
// behind requireAdminAuth at the router level (adminDashboard.routes.ts),
// so req.adminUser is always set by the time this handler runs — still
// checked explicitly below rather than asserted, same defensive
// convention as adminOrderStatus.controller.ts, so a missing admin
// produces a clean 401 instead of a runtime crash if that guarantee is
// ever violated by a future change.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { ShippingUpdateError, updateShipping } from "../services/adminShipping.service.js";

export async function updateShippingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    const { orderNumber } = req.params;
    if (!orderNumber) {
      sendError(res, { message: "Order number is required", statusCode: 400 });
      return;
    }

    const result = await updateShipping(orderNumber, req.body ?? {});

    sendSuccess(res, { message: "Shipping details updated successfully", data: result });
  } catch (error) {
    if (error instanceof ShippingUpdateError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
