// Version 7, Milestone 108: admin-only Courier Guy RATE QUOTE. Mounted
// behind requireAdminAuth at the router level (adminDashboard.routes.ts),
// so req.adminUser is always set by the time this handler runs — still
// checked explicitly below rather than asserted, same defensive
// convention as adminShipping.controller.ts, so a missing admin
// produces a clean 401 instead of a runtime crash if that guarantee is
// ever violated by a future change.
//
// This handler never mutates anything — no Order/Shipping/Payment row
// is read for writing anywhere in this file or in courierGuy.service.ts.
// It only calls out to Courier Guy's /rates endpoint and relays a
// normalised quote back to the admin.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { CourierQuoteError, getCourierQuote, CourierBookingError, bookCourierShipment } from "../services/courierGuy.service.js";

// Same shape used by payment.controller.ts for order number validation
// (e.g. "SG-2026-A1B2") — reused here so an obviously malformed order
// number gets a 400 rather than a 404 that looks like "maybe it just
// doesn't exist yet".
const ORDER_NUMBER_PATTERN = /^SG-\d{4}-[A-Z0-9]{4}$/i;

export async function getCourierQuoteHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    const { orderNumber } = req.params;
    if (!orderNumber || !ORDER_NUMBER_PATTERN.test(orderNumber)) {
      sendError(res, {
        message: "Validation failed",
        errors: [{ field: "orderNumber", message: 'Order number format is invalid — expected e.g. "SG-2026-A1B2".' }],
        statusCode: 400,
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await getCourierQuote(orderNumber.toUpperCase(), {
      parcel: {
        weightKg: body.weightKg,
        lengthCm: body.lengthCm,
        widthCm: body.widthCm,
        heightCm: body.heightCm,
        declaredValue: body.declaredValue,
      },
    });

    sendSuccess(res, { message: "Courier quote retrieved successfully", data: result });
  } catch (error) {
    if (error instanceof CourierQuoteError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

// Version 7, Milestone 112: admin-only Courier Guy BOOKING. Same
// defensive req.adminUser check as getCourierQuoteHandler above — see
// that handler's own comment. courierGuy.service.ts's
// bookCourierShipment() fails closed (503) if either
// COURIER_GUY_ENABLED or COURIER_GUY_BOOKING_ENABLED is false, before
// this handler's own error-mapping ever needs to distinguish why.
export async function bookCourierShipmentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    const { orderNumber } = req.params;
    if (!orderNumber || !ORDER_NUMBER_PATTERN.test(orderNumber)) {
      sendError(res, {
        message: "Validation failed",
        errors: [{ field: "orderNumber", message: 'Order number format is invalid — expected e.g. "SG-2026-A1B2".' }],
        statusCode: 400,
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await bookCourierShipment(orderNumber.toUpperCase(), {
      parcel: {
        weightKg: body.weightKg,
        lengthCm: body.lengthCm,
        widthCm: body.widthCm,
        heightCm: body.heightCm,
        declaredValue: body.declaredValue,
      },
      serviceLevelCode: body.serviceLevelCode,
      serviceLevelId: body.serviceLevelId,
      paymentConfirmed: body.paymentConfirmed,
      specialInstructionsCollection: body.specialInstructionsCollection,
      specialInstructionsDelivery: body.specialInstructionsDelivery,
    });

    sendSuccess(res, { message: "Courier shipment booked successfully", data: result });
  } catch (error) {
    if (error instanceof CourierBookingError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
