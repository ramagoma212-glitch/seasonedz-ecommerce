// Customer order history controller (Version 7, Milestone 130). Both
// handlers require requireCustomerAuth (see customer.routes.ts) —
// req.customerUser is always set by the time either runs. Neither
// route ever reads a customerId from the request itself (query, body,
// or params) — the only customerId ever used is req.customerUser.id,
// so a customer can never ask to see anyone else's orders by supplying
// a different id anywhere in the request.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { getOrderForCustomer, getOrdersForCustomer } from "../services/customerOrder.service.js";

export async function listCustomerOrdersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Set by requireCustomerAuth — this route is unreachable without it.
    const customerId = req.customerUser!.id;
    const orders = await getOrdersForCustomer(customerId);
    sendSuccess(res, { message: "Orders retrieved successfully.", data: { orders } });
  } catch (error) {
    next(error);
  }
}

export async function getCustomerOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const customerId = req.customerUser!.id;
    const { orderNumber } = req.params;

    if (!orderNumber) {
      sendError(res, { message: "Order number is required.", statusCode: 400 });
      return;
    }

    const order = await getOrderForCustomer(orderNumber, customerId);

    // Deliberately the same 404 whether the order doesn't exist at all
    // or exists but belongs to someone else — never a 403, never any
    // wording that would confirm the order number is real. See
    // customerOrder.service.ts's getOrderForCustomer() comment.
    if (!order) {
      sendError(res, { message: "Order not found in this account.", statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Order retrieved successfully.", data: { order } });
  } catch (error) {
    next(error);
  }
}
