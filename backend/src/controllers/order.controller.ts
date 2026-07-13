import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { validateOrderRequest } from "../validators/order.validator.js";
import * as orderService from "../services/order.service.js";
import { OrderError } from "../services/order.service.js";

export async function createOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateOrderRequest(req.body);

    if (!validation.isValid || !validation.value) {
      sendError(res, { message: "Validation failed", errors: validation.errors, statusCode: 400 });
      return;
    }

    const order = await orderService.createOrder(validation.value);

    sendSuccess(res, {
      message: "Order created successfully",
      statusCode: 201,
      data: { orderNumber: order.orderNumber, order },
    });
  } catch (error) {
    if (error instanceof OrderError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function getOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { orderNumber } = req.params;
    if (!orderNumber) {
      sendError(res, { message: "Order number is required", statusCode: 400 });
      return;
    }

    const order = await orderService.getOrderByNumber(orderNumber);
    if (!order) {
      sendError(res, { message: `Order not found: ${orderNumber}`, statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Order retrieved successfully", data: order });
  } catch (error) {
    next(error);
  }
}

export async function getOrderTrackingHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { orderNumber } = req.params;
    if (!orderNumber) {
      sendError(res, { message: "Order number is required", statusCode: 400 });
      return;
    }

    const tracking = await orderService.getOrderTracking(orderNumber);
    if (!tracking) {
      sendError(res, { message: `Order not found: ${orderNumber}`, statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Order tracking retrieved successfully", data: tracking });
  } catch (error) {
    next(error);
  }
}
