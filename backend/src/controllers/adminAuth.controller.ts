// Admin auth controller (Version 7, Milestone 58 — foundation only).
// Only login/logout/me exist here — no order, enquiry, customer or
// product data is read or exposed by anything in this file.

import type { CookieOptions, NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { isProduction } from "../config/env.js";
import {
  ADMIN_SESSION_COOKIE_MAX_AGE_MS,
  ADMIN_SESSION_COOKIE_NAME,
  createSession,
  destroySession,
  verifyCredentials,
} from "../services/adminAuth.service.js";

// SameSite=None is required for the cookie to be sent on cross-site
// requests (GitHub Pages frontend -> Render backend are different
// registrable domains) — browsers require Secure whenever SameSite is
// None, so this is only safe in production (HTTPS). In local dev, the
// frontend (localhost:5173) and backend (localhost:5000) share the
// "localhost" site, so SameSite=Lax works without needing Secure —
// letting admin login be tested over plain HTTP locally.
function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    signed: true,
    path: "/",
  };
}

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      // Deliberately the same generic message as a real wrong-password
      // failure below — never hint at which part of the input was the
      // problem.
      sendError(res, { message: "Invalid email or password.", statusCode: 400 });
      return;
    }

    const admin = await verifyCredentials(email, password);
    if (!admin) {
      sendError(res, { message: "Invalid email or password.", statusCode: 401 });
      return;
    }

    const { rawToken, expiresAt } = await createSession(admin.id);
    res.cookie(ADMIN_SESSION_COOKIE_NAME, rawToken, {
      ...sessionCookieOptions(),
      maxAge: ADMIN_SESSION_COOKIE_MAX_AGE_MS,
    });

    sendSuccess(res, { message: "Signed in successfully.", data: { admin, expiresAt } });
  } catch (error) {
    next(error);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.signedCookies?.[ADMIN_SESSION_COOKIE_NAME];
    if (rawToken && typeof rawToken === "string") {
      await destroySession(rawToken);
    }

    res.clearCookie(ADMIN_SESSION_COOKIE_NAME, sessionCookieOptions());
    sendSuccess(res, { message: "Signed out successfully." });
  } catch (error) {
    next(error);
  }
}

// Protected by requireAdminAuth middleware on the route — req.adminUser
// is always set by the time this handler runs.
export function meHandler(req: Request, res: Response): void {
  sendSuccess(res, { message: "Current admin retrieved successfully.", data: { admin: req.adminUser } });
}
