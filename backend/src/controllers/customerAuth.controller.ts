// Customer auth controller (Version 7, Milestone 127 — backend
// foundation; password reset added Milestone 132). No product or admin
// data is read or exposed by anything in this file. Order history has
// its own controller (customerOrder.controller.ts).

import type { CookieOptions, NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { env, isProduction } from "../config/env.js";
import {
  CUSTOMER_SESSION_COOKIE_MAX_AGE_MS,
  CUSTOMER_SESSION_COOKIE_NAME,
  CustomerAuthError,
  createCustomerSession,
  destroyCustomerSession,
  registerCustomer,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyCustomerCredentials,
} from "../services/customerAuth.service.js";
import { sendPasswordResetEmail } from "../services/email/email.service.js";
import { asRecord, isNonEmptyString, isValidEmail } from "../validators/shared.js";

// Version 7, Milestone 132: prefers the configured production frontend
// origin (FRONTEND_PRODUCTION_URL, comma-separated — see env.ts's own
// comment on domain-migration support) so the reset link always points
// at the real live site once deployed, falling back to FRONTEND_URL for
// local/dev. Never hardcodes a domain directly in code.
function resetPasswordBaseUrl(): string {
  const firstProductionOrigin = env.frontendProductionUrl?.split(",")[0]?.trim();
  return firstProductionOrigin || env.frontendUrl;
}

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

const GENERIC_FORGOT_PASSWORD_MESSAGE = "If an account exists for that email, a reset link has been sent.";

// Version 7, Milestone 132: returns the exact same generic success
// message and 200 status for every case — missing/malformed email,
// unknown email, inactive customer, or a genuine match — so nothing
// about the response can ever be used to enumerate real accounts. Only
// a genuine, active, registered customer match (requestPasswordReset()
// returning non-null) ever triggers an actual reset-token creation and
// email send; both happen silently either way from the caller's side.
export async function forgotPasswordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = asRecord(req.body);

    if (isNonEmptyString(email) && isValidEmail(email)) {
      const result = await requestPasswordReset(email);
      if (result) {
        const resetUrl = `${resetPasswordBaseUrl()}/account/reset-password?token=${result.rawToken}`;
        // Fire-and-forget, same discipline as every other send*Email
        // call site — a Brevo failure must never affect this response,
        // and dispatch() already never throws regardless.
        void sendPasswordResetEmail({
          customerFirstName: result.customer.firstName,
          customerEmail: result.customer.email,
          resetUrl,
        }).catch(() => {});
      }
    }

    sendSuccess(res, { message: GENERIC_FORGOT_PASSWORD_MESSAGE });
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password, confirmPassword } = asRecord(req.body);

    if (!isNonEmptyString(token) || typeof password !== "string" || !password) {
      sendError(res, { message: "This reset link is invalid or has expired.", statusCode: 400 });
      return;
    }

    // Only checked if the caller actually sent it — matches the task's
    // own "confirmPassword if desired" framing. The frontend always
    // sends it; a direct API call without it still works as long as
    // the token/password themselves are valid.
    if (typeof confirmPassword === "string" && confirmPassword !== password) {
      sendError(res, { message: "Passwords do not match.", statusCode: 400 });
      return;
    }

    await resetPasswordWithToken(token, password);
    sendSuccess(res, { message: "Your password has been reset. You can now log in." });
  } catch (error) {
    if (error instanceof CustomerAuthError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
