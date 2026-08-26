// Version 7, Milestone 172B.4: public, unauthenticated referral capture
// — the storefront calls this directly (no admin session, no customer
// login required) whenever a ?ref=CODE link is followed, and again from
// the checkout page for a live discount preview. See
// controllers/referralCapture.controller.ts and
// services/referralCapture.service.ts.
//
// Deliberately mounted at /api/referrals — separate path, separate
// router, separate file from /api/admin/referrals
// (adminReferrals.routes.ts, requireAdminAuth-gated) — same "never
// confuse admin and public" discipline every other admin route group in
// this backend already follows.

import { Router } from "express";
import { captureReferralHandler, previewReferralHandler } from "../controllers/referralCapture.controller.js";
import { referralCaptureRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.get("/capture", referralCaptureRateLimiter, captureReferralHandler);
router.get("/preview", referralCaptureRateLimiter, previewReferralHandler);

export default router;
