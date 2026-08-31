// Admin auth routes (Version 7, Milestone 58 — foundation only).
// Mounted at /api/admin/auth in routes/index.ts.
//
// Milestone 179: login is now two steps (password, then OTP — neither
// alone creates a session, see adminAuth.controller.ts's own header
// comment) plus forgotten/reset password and invitation activation.
// Creating an invitation is an authenticated ADMIN-only management
// action and lives on adminUsers.routes.ts instead — everything below
// is either unauthenticated (a brand new admin has no session yet) or
// self-service for whichever admin is already signed in.

import { Router } from "express";
import {
  activateInvitationHandler,
  forgotPasswordHandler,
  loginHandler,
  logoutAllSessionsHandler,
  logoutHandler,
  meHandler,
  previewInvitationHandler,
  resendOtpHandler,
  resetPasswordHandler,
  verifyOtpHandler,
} from "../controllers/adminAuth.controller.js";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import {
  adminForgotPasswordRateLimiter,
  adminLoginRateLimiter,
  adminOtpResendRateLimiter,
  adminOtpVerifyRateLimiter,
  adminResetPasswordRateLimiter,
} from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/login", adminLoginRateLimiter, loginHandler);
router.post("/otp/verify", adminOtpVerifyRateLimiter, verifyOtpHandler);
router.post("/otp/resend", adminOtpResendRateLimiter, resendOtpHandler);
router.post("/logout", logoutHandler);
router.post("/logout-all", requireAdminAuth, logoutAllSessionsHandler);
router.get("/me", requireAdminAuth, meHandler);

router.post("/forgot-password", adminForgotPasswordRateLimiter, forgotPasswordHandler);
router.post("/reset-password", adminResetPasswordRateLimiter, resetPasswordHandler);

router.get("/invitation", adminResetPasswordRateLimiter, previewInvitationHandler);
router.post("/invitation/activate", adminResetPasswordRateLimiter, activateInvitationHandler);

export default router;
