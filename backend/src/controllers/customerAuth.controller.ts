// Customer auth controller (Version 7, Milestone 127 — backend
// foundation only). Only register/login/logout/me exist here — no
// order history, no password reset (later milestones), no product or
// admin data is read or exposed by anything in this file.

import type { CookieOptions, NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { isProduction } from "../config/env.js";
import {
  CUSTOMER_SESSION_COOKIE_MAX_AGE_MS,
  CUSTOMER_SESSION_COOKIE_NAME,
  CustomerAuthError,
  createCustomerSession,
  destroyCustomerSession,
  registerCustomer,
  verifyCustomerCredentials,
} from "../services/customerAuth.service.js";
import { asRecord, isNonEmptyString, isValidEmail } from "../validators/shared.js";

// Same reasoning as adminAuth.controller.ts's sessionCookieOptions():
// SameSite=None+Secure is required in production for a cross-site
// frontend->backend cookie; SameSite=Lax without Secure works for
// local HTTP dev where frontend and backend share "localhost".
function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    signed: true,
    path: "/",
  };
}

export async function registerHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = asRecord(req.body);
    const { email, password, firstName, lastName, phone } = body;

    if (
      !isNonEmptyString(email) ||
      !isValidEmail(email) ||
      typeof password !== "string" ||
      !password ||
      !isNonEmptyString(firstName) ||
      !isNonEmptyString(lastName)
    ) {
      sendError(res, { message: "A valid email, password, first name and last name are required.", statusCode: 400 });
      return;
    }

    const customer = await registerCustomer({
      email,
      password,
      firstName,
      lastName,
      phone: isNonEmptyString(phone) ? phone : null,
    });

    const { rawToken, expiresAt } = await createCustomerSession(customer.id);
    res.cookie(CUSTOMER_SESSION_COOKIE_NAME, rawToken, {
      ...sessionCookieOptions(),
      maxAge: CUSTOMER_SESSION_COOKIE_MAX_AGE_MS,
    });

    sendSuccess(res, { message: "Account created successfully.", statusCode: 201, data: { customer, expiresAt } });
  } catch (error) {
    if (error instanceof CustomerAuthError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      // Deliberately the same generic message as a real wrong-password
      // failure below — never hint at which part of the input was the
      // problem, same discipline as adminAuth.controller.ts.
      sendError(res, { message: "Invalid email or password.", statusCode: 400 });
      return;
    }

    const customer = await verifyCustomerCredentials(email, password);
    if (!customer) {
      sendError(res, { message: "Invalid email or password.", statusCode: 401 });
      return;
    }

    const { rawToken, expiresAt } = await createCustomerSession(customer.id);
    res.cookie(CUSTOMER_SESSION_COOKIE_NAME, rawToken, {
      ...sessionCookieOptions(),
      maxAge: CUSTOMER_SESSION_COOKIE_MAX_AGE_MS,
    });

    sendSuccess(res, { message: "Signed in successfully.", data: { customer, expiresAt } });
  } catch (error) {
    next(error);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawToken = req.signedCookies?.[CUSTOMER_SESSION_COOKIE_NAME];
    if (rawToken && typeof rawToken === "string") {
      await destroyCustomerSession(rawToken);
    }

    res.clearCookie(CUSTOMER_SESSION_COOKIE_NAME, sessionCookieOptions());
    sendSuccess(res, { message: "Signed out successfully." });
  } catch (error) {
    next(error);
  }
}

// Protected by requireCustomerAuth middleware on the route —
// req.customerUser is always set by the time this handler runs.
export function meHandler(req: Request, res: Response): void {
  sendSuccess(res, { message: "Current customer retrieved successfully.", data: { customer: req.customerUser } });
}
