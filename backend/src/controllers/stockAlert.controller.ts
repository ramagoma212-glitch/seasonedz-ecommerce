// Version 7, Milestone 174C: back-in-stock subscriptions — see
// stockAlert.service.ts's own header comment.
import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { StockAlertError, subscribeToStockAlert } from "../services/stockAlert.service.js";

export async function subscribeToStockAlertHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const productSlug = typeof req.body?.productSlug === "string" ? req.body.productSlug.trim() : "";
    if (!productSlug) {
      sendError(res, { message: "productSlug is required.", statusCode: 400 });
      return;
    }

    const subscription = await subscribeToStockAlert(customerId, productSlug);
    sendSuccess(res, { message: "We'll email you when this product is back in stock.", statusCode: 201, data: subscription });
  } catch (error) {
    if (error instanceof StockAlertError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
