import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { validateOrderRequest } from "../validators/order.validator.js";
import * as orderService from "../services/order.service.js";
import { OrderError, type OrderOutput } from "../services/order.service.js";
import { sendAdminNewOrderEmail, sendOrderCreatedEmail } from "../services/email/email.service.js";
import type { OrderEmailData } from "../services/email/email.types.js";

// Version 7, Milestone 117: maps the full, already-safe OrderOutput
// shape onto the small, independent OrderEmailData shape the email
// templates need — see email.types.ts's own comment for why these
// stay deliberately separate rather than reusing OrderOutput directly.
function toOrderEmailData(order: OrderOutput): OrderEmailData {
  return {
    orderNumber: order.orderNumber,
    customerFirstName: order.customer.firstName,
    customerLastName: order.customer.lastName,
    customerEmail: order.customer.email,
    customerPhone: order.customer.phone,
    total: order.total,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    items: order.items.map((item) => ({ productName: item.productName, quantity: item.quantity, lineTotal: item.lineTotal })),
    deliveryStreetAddress: order.deliveryAddress.streetAddress,
    deliverySuburb: order.deliveryAddress.suburb,
    deliveryCity: order.deliveryAddress.city,
    deliveryProvince: order.deliveryAddress.province,
    deliveryPostalCode: order.deliveryAddress.postalCode,
    deliveryNotes: order.deliveryAddress.deliveryNotes,
  };
}

export async function createOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateOrderRequest(req.body);

    if (!validation.isValid || !validation.value) {
      sendError(res, { message: "Validation failed", errors: validation.errors, statusCode: 400 });
      return;
    }

    const order = await orderService.createOrder(validation.value);

    // Version 7, Milestone 117: fire-and-forget, deliberately not
    // awaited into the response — sendOrderCreatedEmail/
    // sendAdminNewOrderEmail already never throw (email.service.ts's
    // dispatch() catches every Brevo failure internally), but this is
    // belt-and-braces so a checkout can never fail or slow down
    // because of an email problem, current or future. Both are true
    // no-ops while EMAIL_ENABLED=false (the default).
    const emailData = toOrderEmailData(order);
    void sendOrderCreatedEmail(emailData).catch(() => {});
    void sendAdminNewOrderEmail(emailData).catch(() => {});

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
