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

// Version 7, Milestone 133: SameSite=Lax in production, not "none".
// Before this milestone, the frontend (GitHub Pages, then
// www.seasonedzgroup.co.za) and the backend (onrender.com) were
// different registrable domains, so this cookie was genuinely
// cross-site and SameSite=None+Secure was required for browsers to
// send it at all. Now that the API is served from
// api.seasonedzgroup.co.za — a subdomain of the same
// seasonedzgroup.co.za site as the frontend — a fetch() from one to
// the other is same-site, not cross-site: SameSite=Lax cookies ARE
// sent on same-site fetch/XHR requests (Lax only restricts cross-site
// ones). This matters beyond just tidiness: WebKit (Safari, and every
// iOS browser, which must use WebKit) applies cross-site tracking
// prevention that was silently discarding this style of cookie on
// iPhone even with SameSite=None+Secure set correctly — Lax on a
// genuinely same-site request isn't subject to that at all (see
// customerAuth.controller.ts's own copy of this reasoning, found live
// during Milestone 132B's iPhone customer-login test).
//
// In local dev, frontend (localhost:5173) and backend (localhost:5000)
// already share the "localhost" site, so "lax" there is unchanged from
// before.
//
// This must not go live before api.seasonedzgroup.co.za is actually
// connected in Render with DNS propagated — deploying it while the
// frontend still calls onrender.com would make the cookie genuinely
// cross-site again, and Lax would then block it entirely, breaking
// admin login everywhere rather than just on iPhone.
function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
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
