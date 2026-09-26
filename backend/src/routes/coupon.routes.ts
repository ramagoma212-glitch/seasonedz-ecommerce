// Milestone 197: public, unauthenticated (optionally-customer-aware)
// coupon preview — mounted at /api/coupons, separate from the
// requireAdminAuth-gated /api/admin/coupons (adminCoupon.routes.ts), the
// same "never confuse admin and public" discipline referrals.routes.ts/
// adminReferrals.routes.ts already establish.

import { Router } from "express";
import { previewCouponHandler } from "../controllers/coupon.controller.js";
import { optionalCustomerAuth } from "../middleware/optionalCustomerAuth.middleware.js";
import { couponPreviewRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/preview", couponPreviewRateLimiter, optionalCustomerAuth, previewCouponHandler);

export default router;
