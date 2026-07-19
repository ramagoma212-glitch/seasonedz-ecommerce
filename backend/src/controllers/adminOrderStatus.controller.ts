// Version 7, Milestone 63: the one write handler under /api/admin.
// Kept in its own controller file, separate from the read-only
// adminDashboard.controller.ts, for the same reason the service is
// separate — the write path should be easy to find and review on its
// own. Mounted behind requireAdminAuth at the router level
// (adminDashboard.routes.ts), so req.adminUser is always set by the
// time this handler runs — still checked explicitly below rather than
// asserted, so a missing admin produces a clean 401 instead of a
// runtime crash if that guarantee is ever violated by a future change.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { OrderStatusUpdateError, updateOrderStatus } from "../services/adminOrderStatus.service.js";

export async function updateOrderStatusHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const { newStatus, note } = req.body ?? {};

    const result = await updateOrderStatus(orderNumber, newStatus, note, req.adminUser);

    sendSuccess(res, { message: "Order status updated successfully", data: result });
  } catch (error) {
    if (error instanceof OrderStatusUpdateError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
