// POST /api/payments/payfast/initiate request handling. Request-shape
// validation lives here (it's simple enough not to need its own
// validators/ file — one required string field, one format check) —
// order lookup/eligibility/field-building is all in payfast.service.ts.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { asRecord, isNonEmptyString } from "../validators/shared.js";
import { initiatePayfastPayment, PaymentInitiationError } from "../services/payfast.service.js";

// Same shape the frontend already validates against for order tracking
// (src/pages/trackOrder.js) and the same shape backend/src/utils/
// orderNumber.ts generates — e.g. "SG-2026-A1B2".
const ORDER_NUMBER_PATTERN = /^SG-\d{4}-[A-Z0-9]{4}$/i;

export async function initiatePayfastPaymentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = asRecord(req.body);
    const rawOrderNumber = body.orderNumber;

    if (!isNonEmptyString(rawOrderNumber)) {
      sendError(res, {
        message: "Validation failed",
        errors: [{ field: "orderNumber", message: "Order number is required." }],
        statusCode: 400,
      });
      return;
    }

    const orderNumber = rawOrderNumber.trim().toUpperCase();

    if (!ORDER_NUMBER_PATTERN.test(orderNumber)) {
      sendError(res, {
        message: "Validation failed",
        errors: [{ field: "orderNumber", message: 'Order number format is invalid — expected e.g. "SG-2026-A1B2".' }],
        statusCode: 400,
      });
      return;
    }

    const result = await initiatePayfastPayment(orderNumber);

    sendSuccess(res, {
      message: "PayFast payment prepared successfully",
      data: result,
    });
  } catch (error) {
    if (error instanceof PaymentInitiationError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
