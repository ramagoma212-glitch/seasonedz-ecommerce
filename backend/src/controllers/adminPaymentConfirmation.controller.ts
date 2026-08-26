// Version 7, Milestone 172B.6: manual payment confirmation for Bank
// Transfer / Cash on Delivery orders. Thin handler only — every rule
// lives in adminPaymentConfirmation.service.ts. Mounted behind
// requireAdminAuth at the router level (adminDashboard.routes.ts).

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { ManualPaymentConfirmationError, confirmManualPayment } from "../services/adminPaymentConfirmation.service.js";

export async function confirmManualPaymentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const result = await confirmManualPayment(orderNumber, req.adminUser);
    sendSuccess(res, { message: "Payment confirmed successfully", data: result });
  } catch (error) {
    if (error instanceof ManualPaymentConfirmationError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
