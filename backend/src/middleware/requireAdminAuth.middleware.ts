// Admin auth guard (Version 7, Milestone 58 — foundation only).
// Attaches `req.adminUser` (a SafeAdminProfile — never a password
// hash) when a valid session cookie is present; otherwise responds
// 401 immediately.
//
// Deliberately checks for the cookie's presence *before* touching the
// database at all — an unauthenticated request (no cookie, or a
// tampered/unsigned one) is rejected with zero Prisma calls, which is
// both cheaper and means this 401 path works correctly even before
// the AdminUser/AdminSession migration has ever been applied.

import type { NextFunction, Request, Response } from "express";
import { sendError } from "../utils/apiResponse.js";
import { ADMIN_SESSION_COOKIE_NAME, validateSession, type SafeAdminProfile } from "../services/adminAuth.service.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: SafeAdminProfile;
    }
  }
}

export async function requireAdminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const rawToken = req.signedCookies?.[ADMIN_SESSION_COOKIE_NAME];

  if (!rawToken || typeof rawToken !== "string") {
    sendError(res, { message: "Authentication required.", statusCode: 401 });
    return;
  }

  try {
    const admin = await validateSession(rawToken);
    if (!admin) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }

    req.adminUser = admin;
    next();
  } catch (error) {
    next(error);
  }
}
