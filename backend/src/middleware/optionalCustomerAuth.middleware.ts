// Optional customer auth guard (Version 7, Milestone 129). Unlike
// requireCustomerAuth.middleware.ts, this middleware never rejects a
// request — it only ever enriches it. If a valid customer_session
// cookie is present, req.customerUser is attached (the same
// SafeCustomerProfile shape, never a password hash); if the cookie is
// missing, expired, or otherwise invalid, the request simply continues
// as a guest with req.customerUser left undefined. This is the only
// customer-auth middleware used on POST /api/orders — checkout must
// never require login, so nothing here can ever produce a 401 or
// otherwise block the request.
//
// Mirrors requireCustomerAuth.middleware.ts's cookie-read/session-
// lookup logic exactly, minus the rejection branch. req.customerUser's
// type is already declared globally there — no need to redeclare it.

import type { NextFunction, Request, Response } from "express";
import { CUSTOMER_SESSION_COOKIE_NAME, getCustomerBySessionToken } from "../services/customerAuth.service.js";

export async function optionalCustomerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawToken = req.signedCookies?.[CUSTOMER_SESSION_COOKIE_NAME];

  if (!rawToken || typeof rawToken !== "string") {
    next();
    return;
  }

  try {
    const customer = await getCustomerBySessionToken(rawToken);
    if (customer) {
      req.customerUser = customer;
    }
  } catch {
    // An auth lookup failure must never block checkout — treated
    // exactly like a missing/invalid session, continue as guest.
  }

  next();
}
