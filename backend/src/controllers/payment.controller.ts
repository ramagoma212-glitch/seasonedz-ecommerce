// POST /api/payments/payfast/initiate and POST /api/payments/payfast/
// notify request handling. Request-shape validation for /initiate
// lives here (it's simple enough not to need its own validators/ file
// — one required string field, one format check); ITN field
// extraction/signature/eligibility for /notify is all in
// payfast.service.ts. Order lookup/eligibility/field-building for
// /initiate is likewise all in payfast.service.ts.

import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { asRecord, isNonEmptyString } from "../validators/shared.js";
import { initiatePayfastPayment, PaymentError, processPayfastNotification } from "../services/payfast.service.js";

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
    if (error instanceof PaymentError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

// PayFast POSTs this as a server-to-server form-urlencoded request —
// never trust it just because it hit this URL; every field is
// verified in processPayfastNotification() before anything is
// updated. req.body here is never logged, and neither is anything
// derived from it (see payfast.service.ts / payfastSignature.ts).
export async function payfastNotifyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawBody = asRecord(req.body);
    const result = await processPayfastNotification(rawBody);
    sendSuccess(res, { message: result.message });
  } catch (error) {
    if (error instanceof PaymentError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
