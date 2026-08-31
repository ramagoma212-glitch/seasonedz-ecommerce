// Admin auth controller. Milestone 179 rewrites the login flow into
// two steps (email+password, then email OTP — brief Part C) and adds
// forgotten/reset password (Part D) and invitation activation (Part
// B's public half; creating an invitation is an authenticated admin
// management action, see adminUsers.controller.ts instead). No order,
// enquiry, customer or product data is read or exposed by anything in
// this file.

import type { CookieOptions, NextFunction, Request, Response } from "express";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { isProduction } from "../config/env.js";
import {
  ADMIN_SESSION_COOKIE_MAX_AGE_MS,
  ADMIN_SESSION_COOKIE_NAME,
  createSession,
  destroySession,
  recordCompletedLogin,
  revokeAllSessions,
  verifyPassword,
} from "../services/adminAuth.service.js";
import { findAdminIdForChallengeToken, issueOtpChallenge, maskEmailForDisplay, secondsUntilOtpResendAllowed, verifyOtpChallenge, AdminOtpError } from "../services/adminOtp.service.js";
import { sendAdminOtpEmail, sendAdminPasswordResetEmail } from "../services/email/email.service.js";
import { recordAdminSecurityEvent } from "../services/adminSecurityEvent.service.js";
import { requestAdminPasswordReset, resetAdminPasswordWithToken, AdminPasswordResetError } from "../services/adminPasswordReset.service.js";
import { previewInvitation, activateInvitation, AdminInvitationError } from "../services/adminInvitation.service.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";
import { prisma } from "../config/prisma.js";
import { asRecord, isNonEmptyString } from "../validators/shared.js";

// Version 7, Milestone 133: SameSite=Lax in production, not "none" —
// see this function's own original comment (unchanged by Milestone
// 179): api.seasonedzgroup.co.za is a subdomain of the same site as
// the frontend, so this is a same-site request, and Lax avoids
// WebKit/iOS silently discarding a cross-site-shaped cookie.
function sessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    signed: true,
    path: "/",
  };
}

function requestMeta(req: Request): { ipAddress: string | undefined; userAgent: string | undefined } {
  return { ipAddress: req.ip, userAgent: req.get("user-agent") };
}

const GENERIC_LOGIN_ERROR = "Unable to sign in with those details.";

// ---------------------------------------------------------------------------
// Step 1: email + password. Never creates a session (brief section 8).
// ---------------------------------------------------------------------------
export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body ?? {};
    const { ipAddress, userAgent } = requestMeta(req);

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
      sendError(res, { message: GENERIC_LOGIN_ERROR, statusCode: 400 });
      return;
    }

    const admin = await verifyPassword(email, password);
    if (!admin) {
      void recordAdminSecurityEvent({ adminUserId: null, eventType: "ADMIN_LOGIN_PASSWORD_FAILED", summary: `Failed login attempt for ${email.trim().toLowerCase()}`, ipAddress, userAgent });
      sendError(res, { message: GENERIC_LOGIN_ERROR, statusCode: 401 });
      return;
    }

    void recordAdminSecurityEvent({ adminUserId: admin.id, eventType: "ADMIN_LOGIN_PASSWORD_SUCCEEDED", ipAddress, userAgent });

    const { rawChallengeToken, code, expiresAt } = await issueOtpChallenge(admin.id);
    void recordAdminSecurityEvent({ adminUserId: admin.id, eventType: "ADMIN_OTP_SENT", ipAddress, userAgent });

    // Fire-and-forget, same discipline as every other transactional
    // email in this backend — a Brevo hiccup must never block the
    // response, and the code itself is never logged or persisted
    // anywhere beyond its own hash (adminOtp.service.ts).
    void sendAdminOtpEmail({ adminName: admin.name, adminEmail: admin.email, code, expiresInMinutes: 10 }).catch(() => {});

    sendSuccess(res, {
      message: "Verification code sent.",
      data: { challengeToken: rawChallengeToken, maskedEmail: maskEmailForDisplay(admin.email), expiresAt },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Step 2: email OTP. Only this succeeding ever creates a session.
// ---------------------------------------------------------------------------
export async function verifyOtpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { challengeToken, code } = req.body ?? {};
    const { ipAddress, userAgent } = requestMeta(req);

    if (typeof challengeToken !== "string" || !challengeToken || typeof code !== "string" || !/^\d{6}$/.test(code)) {
      sendError(res, { message: "Invalid verification code.", statusCode: 400 });
      return;
    }

    let adminUserId: string;
    try {
      ({ adminUserId } = await verifyOtpChallenge(challengeToken, code));
    } catch (error) {
      if (error instanceof AdminOtpError) {
        void recordAdminSecurityEvent({ adminUserId: null, eventType: "ADMIN_OTP_FAILED", summary: error.message, ipAddress, userAgent });
        sendError(res, { message: error.message, statusCode: error.statusCode });
        return;
      }
      throw error;
    }

    const admin = await prisma.adminUser.findUnique({ where: { id: adminUserId } });
    if (!admin || !admin.isActive) {
      sendError(res, { message: "Invalid verification code.", statusCode: 401 });
      return;
    }

    await recordCompletedLogin(admin.id);
    void recordAdminSecurityEvent({ adminUserId: admin.id, eventType: "ADMIN_OTP_SUCCEEDED", ipAddress, userAgent });
    void recordAdminSecurityEvent({ adminUserId: admin.id, eventType: "ADMIN_LOGIN_SUCCEEDED", ipAddress, userAgent });

    const { rawToken, expiresAt } = await createSession(admin.id);
    res.cookie(ADMIN_SESSION_COOKIE_NAME, rawToken, { ...sessionCookieOptions(), maxAge: ADMIN_SESSION_COOKIE_MAX_AGE_MS });

    sendSuccess(res, {
      message: "Signed in successfully.",
      data: { admin: { id: admin.id, name: admin.name, email: admin.email, role: admin.role }, expiresAt },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Resend — brief section 15: 60 second minimum cooldown.
// ---------------------------------------------------------------------------
export async function resendOtpHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { challengeToken } = req.body ?? {};
    const { ipAddress, userAgent } = requestMeta(req);

    if (typeof challengeToken !== "string" || !challengeToken) {
      sendError(res, { message: "Invalid request.", statusCode: 400 });
      return;
    }

    const pendingAdminUserId = await findAdminIdForChallengeToken(challengeToken);
    if (!pendingAdminUserId) {
      sendError(res, { message: "This verification session has expired. Please sign in again.", statusCode: 400 });
      return;
    }

    const cooldownRemaining = await secondsUntilOtpResendAllowed(pendingAdminUserId);
    if (cooldownRemaining !== null) {
      sendError(res, { message: `Please wait ${cooldownRemaining} seconds before requesting a new code.`, statusCode: 429 });
      return;
    }

    const admin = await prisma.adminUser.findUnique({ where: { id: pendingAdminUserId } });
    if (!admin || !admin.isActive) {
      sendError(res, { message: "This verification session has expired. Please sign in again.", statusCode: 400 });
      return;
    }

    const { rawChallengeToken, code, expiresAt } = await issueOtpChallenge(admin.id);
    void recordAdminSecurityEvent({ adminUserId: admin.id, eventType: "ADMIN_OTP_SENT", summary: "Resend", ipAddress, userAgent });
    void sendAdminOtpEmail({ adminName: admin.name, adminEmail: admin.email, code, expiresInMinutes: 10 }).catch(() => {});

    sendSuccess(res, { message: "A new verification code has been sent.", data: { challengeToken: rawChallengeToken, maskedEmail: maskEmailForDisplay(admin.email), expiresAt } });
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
    if (req.adminUser) {
      void recordAdminSecurityEvent({ adminUserId: req.adminUser.id, eventType: "ADMIN_LOGOUT", ...requestMeta(req) });
    }

    res.clearCookie(ADMIN_SESSION_COOKIE_NAME, sessionCookieOptions());
    sendSuccess(res, { message: "Signed out successfully." });
  } catch (error) {
    next(error);
  }
}

// Brief section 32: an admin revoking their OWN sessions (revoking
// another admin's sessions is an adminUsers.controller.ts action,
// since it targets someone else's account). Clears this browser's own
// cookie too, since the session it names was just revoked along with
// everything else.
export async function logoutAllSessionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const count = await revokeAllSessions(req.adminUser.id);
    void recordAdminSecurityEvent({ adminUserId: req.adminUser.id, eventType: "ADMIN_SESSIONS_REVOKED", summary: `${count} session(s) revoked (self)`, ...requestMeta(req) });

    res.clearCookie(ADMIN_SESSION_COOKIE_NAME, sessionCookieOptions());
    sendSuccess(res, { message: "You have been signed out of all sessions." });
  } catch (error) {
    next(error);
  }
}

export function meHandler(req: Request, res: Response): void {
  sendSuccess(res, { message: "Current admin retrieved successfully.", data: { admin: req.adminUser } });
}

// ---------------------------------------------------------------------------
// Part D: forgotten / reset password.
// ---------------------------------------------------------------------------

const GENERIC_FORGOT_PASSWORD_MESSAGE = "If an admin account exists for that email address, password reset instructions will be sent.";

function adminResetPasswordBaseUrl(): string {
  return preferredFrontendBaseUrl();
}

export async function forgotPasswordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = asRecord(req.body);
    const { ipAddress, userAgent } = requestMeta(req);

    if (isNonEmptyString(email)) {
      const result = await requestAdminPasswordReset(email);
      if (result) {
        void recordAdminSecurityEvent({ adminUserId: result.admin.id, eventType: "ADMIN_PASSWORD_RESET_REQUESTED", ipAddress, userAgent });
        const resetUrl = `${adminResetPasswordBaseUrl()}/admin/reset-password?token=${result.rawToken}`;
        void sendAdminPasswordResetEmail({ adminName: result.admin.name, adminEmail: result.admin.email, resetUrl }).catch(() => {});
      }
    }

    // Same generic response every time (brief section 21) — never
    // reveals whether the account exists.
    sendSuccess(res, { message: GENERIC_FORGOT_PASSWORD_MESSAGE });
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password, confirmPassword } = asRecord(req.body);
    const { ipAddress, userAgent } = requestMeta(req);

    if (!isNonEmptyString(token) || typeof password !== "string" || !password) {
      sendError(res, { message: "This reset link is invalid or has expired.", statusCode: 400 });
      return;
    }
    if (typeof confirmPassword === "string" && confirmPassword !== password) {
      sendError(res, { message: "Passwords do not match.", statusCode: 400 });
      return;
    }

    const admin = await resetAdminPasswordWithToken(token, password);
    void recordAdminSecurityEvent({ adminUserId: admin.id, eventType: "ADMIN_PASSWORD_RESET_COMPLETED", ipAddress, userAgent });
    void recordAdminSecurityEvent({ adminUserId: admin.id, eventType: "ADMIN_SESSIONS_REVOKED", summary: "All sessions revoked (password reset)", ipAddress, userAgent });

    sendSuccess(res, { message: "Your password has been reset. Please sign in again." });
  } catch (error) {
    if (error instanceof AdminPasswordResetError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

// ---------------------------------------------------------------------------
// Part B (public half): opening and completing an activation link.
// Creating the invitation itself is an authenticated ADMIN action —
// see adminUsers.controller.ts.
// ---------------------------------------------------------------------------

export async function previewInvitationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.query.token;
    if (typeof token !== "string" || !token) {
      sendError(res, { message: "This invitation link is invalid or has expired.", statusCode: 400 });
      return;
    }
    const preview = await previewInvitation(token);
    sendSuccess(res, { message: "OK", data: preview });
  } catch (error) {
    if (error instanceof AdminInvitationError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function activateInvitationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, password, confirmPassword } = asRecord(req.body);
    const { ipAddress, userAgent } = requestMeta(req);

    if (!isNonEmptyString(token) || typeof password !== "string" || !password) {
      sendError(res, { message: "This invitation link is invalid or has expired.", statusCode: 400 });
      return;
    }
    if (typeof confirmPassword === "string" && confirmPassword !== password) {
      sendError(res, { message: "Passwords do not match.", statusCode: 400 });
      return;
    }

    const admin = await activateInvitation(token, password);
    void recordAdminSecurityEvent({ adminUserId: admin.id, eventType: "ADMIN_ACCOUNT_ACTIVATED", ipAddress, userAgent });

    sendSuccess(res, { message: "Your account is ready. Please sign in." });
  } catch (error) {
    if (error instanceof AdminInvitationError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
