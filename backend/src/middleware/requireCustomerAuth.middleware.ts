// Customer auth guard (Version 7, Milestone 127 — backend foundation
// only). Attaches `req.customerUser` (a SafeCustomerProfile — never a
// password hash) when a valid customer_session cookie is present;
// otherwise responds 401 immediately. Mirrors requireAdminAuth.middleware.ts
// exactly, but reads a fully separate cookie and looks up a fully
// separate session table — an admin_session cookie is never read here,
// and this can never authenticate as a customer using an admin
// session, or vice versa.
//
// Deliberately checks for the cookie's presence *before* touching the
// database at all — an unauthenticated request is rejected with zero
// Prisma calls.

import type { NextFunction, Request, Response } from "express";
import { sendError } from "../utils/apiResponse.js";
import { CUSTOMER_SESSION_COOKIE_NAME, getCustomerBySessionToken, type SafeCustomerProfile } from "../services/customerAuth.service.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customerUser?: SafeCustomerProfile;
    }
  }
}

export async function requireCustomerAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawToken = req.signedCookies?.[CUSTOMER_SESSION_COOKIE_NAME];

  if (!rawToken || typeof rawToken !== "string") {
    sendError(res, { message: "Authentication required.", statusCode: 401 });
    return;
  }

  try {
    const customer = await getCustomerBySessionToken(rawToken);
    if (!customer) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    req.customerUser = customer;
    next();
  } catch (error) {
    next(error);
  }
}
