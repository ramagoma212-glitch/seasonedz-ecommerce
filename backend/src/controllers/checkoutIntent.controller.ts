// Version 7, Milestone 174C: abandoned checkout recovery — see
// checkoutIntent.service.ts's own header comment. Both routes are
// public/unauthenticated (mounted directly under /api, not
// /api/customers) — a guest checkout is exactly the case this feature
// most needs to cover, and requireCustomerAuth would exclude it
// entirely.
import type { NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { captureCheckoutIntent, getRecoverableCartByToken } from "../services/checkoutIntent.service.js";

// Deliberately silent-success shaped: this is called repeatedly,
// debounced, while a customer is still typing, and must never surface
// an error banner or interrupt checkout — a malformed/incomplete
// capture is simply a no-op inside the service itself.
export async function captureCheckoutIntentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await captureCheckoutIntent({
      email: req.body?.email,
      // Version 7, Milestone 129's own discipline: identity always
      // comes from the verified session, never anything the client
      // sends — see optionalCustomerAuth.middleware.ts.
      customerId: req.customerUser?.id ?? null,
      items: req.body?.items,
    });
    sendSuccess(res, { message: "Checkout progress saved." });
  } catch (error) {
    next(error);
  }
}

export async function recoverCheckoutIntentHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.params;
    if (!token) {
      sendError(res, { message: "A recovery token is required.", statusCode: 400 });
      return;
    }

    const items = await getRecoverableCartByToken(token);
    if (items === null) {
      sendError(res, { message: "This recovery link is no longer valid.", statusCode: 404 });
      return;
    }

    sendSuccess(res, { message: "Cart recovered successfully", data: { items } });
  } catch (error) {
    next(error);
  }
}
