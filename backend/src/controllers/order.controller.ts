import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { validateOrderRequest } from "../validators/order.validator.js";
import * as orderService from "../services/order.service.js";
import { OrderError, type OrderOutput } from "../services/order.service.js";
import { renderAdminNewOrderEmail, renderOrderCreatedEmail } from "../services/email/emailTemplates.js";
import type { OrderEmailData } from "../services/email/email.types.js";
import { env } from "../config/env.js";
import * as notificationEngine from "../services/notificationEngine.service.js";
import { markCheckoutIntentRecovered } from "../services/checkoutIntent.service.js";

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
    deliveryMethod: order.deliveryMethod,
    deliveryFee: order.deliveryFee,
    collectionCity: order.collectionCity,
    deliveryStreetAddress: order.deliveryAddress?.streetAddress ?? null,
    deliverySuburb: order.deliveryAddress?.suburb ?? null,
    deliveryCity: order.deliveryAddress?.city ?? null,
    deliveryProvince: order.deliveryAddress?.province ?? null,
    deliveryPostalCode: order.deliveryAddress?.postalCode ?? null,
    deliveryNotes: order.deliveryAddress?.deliveryNotes ?? null,
    // Version 7, Milestone 152: known at order-creation time (no
    // payment confirmation needed to know WHAT was ordered) — safe to
    // include on both the immediate order-created customer email and
    // the admin new-order alert. guestDownloadUrl is never set here;
    // see email.types.ts's own comment.
    hasDigitalItems: order.items.some((item) => item.productType === "DIGITAL"),
  };
}

export async function createOrderHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const validation = validateOrderRequest(req.body);

    if (!validation.isValid || !validation.value) {
      sendError(res, { message: "Validation failed", errors: validation.errors, statusCode: 400 });
      return;
    }

    // Version 7, Milestone 129: req.customerUser is only ever set by
    // optionalCustomerAuth (order.routes.ts) — never trusted from the
    // request body. undefined (logged out) becomes null (guest order).
    // Version 7, Milestone 168C: registered-customer free-delivery
    // gating was removed — the owner-approved R600 threshold applies to
    // every customer, so createOrder no longer takes an
    // isRegisteredCustomer argument at all.
    const order = await orderService.createOrder(validation.value, req.customerUser?.id ?? null);

    // Version 7, Milestone 117, migrated to the Notification engine in
    // 174B: fire-and-forget, deliberately not awaited into the response
    // — enqueueAndSendNow() never throws to its caller, but this is
    // belt-and-braces so a checkout can never fail or slow down because
    // of a notification problem, current or future. Dedupe keys are
    // stable per orderNumber — order creation is naturally one-shot, so
    // these can never double-enqueue for the same order.
    const emailData = toOrderEmailData(order);
    void notificationEngine
      .enqueueAndSendNow({
        eventType: "ORDER_PLACED",
        templateName: "order-created",
        recipientEmail: emailData.customerEmail,
        orderNumber: order.orderNumber,
        dedupeKey: `ORDER_PLACED:${order.orderNumber}`,
        rendered: renderOrderCreatedEmail(emailData),
      })
      .catch(() => {});
    void notificationEngine
      .enqueueAndSendNow({
        eventType: "ADMIN_NEW_ORDER",
        templateName: "admin-new-order",
        recipientEmail: env.adminNotificationEmail,
        orderNumber: order.orderNumber,
        dedupeKey: `ADMIN_NEW_ORDER:${order.orderNumber}`,
        rendered: renderAdminNewOrderEmail(emailData),
      })
      .catch(() => {});

    // Version 7, Milestone 174C, brief section 34: a completed order
    // must never be followed by a "still interested?" reminder for the
    // same checkout. Fire-and-forget, same discipline as the two
    // notification calls above — a failure here must never affect this
    // response.
    void markCheckoutIntentRecovered(emailData.customerEmail).catch(() => {});

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
