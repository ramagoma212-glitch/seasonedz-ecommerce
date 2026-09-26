// Milestone 197: admin coupon-management routes. Mounted at
// /api/admin/coupons in routes/index.ts — requireAdminAuth applied once,
// at the router level, the same discipline every other admin router
// already follows (see adminAffiliate.routes.ts's own header comment for
// why this is real backend authorization, not merely a hidden nav link).

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import {
  activateAdminCouponHandler,
  createAdminCouponHandler,
  deactivateAdminCouponHandler,
  deleteAdminCouponHandler,
  getAdminCouponHandler,
  listAdminCouponsHandler,
  updateAdminCouponHandler,
} from "../controllers/adminCoupon.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/", listAdminCouponsHandler);
router.post("/", createAdminCouponHandler);
router.get("/:id", getAdminCouponHandler);
router.patch("/:id", updateAdminCouponHandler);
router.patch("/:id/activate", activateAdminCouponHandler);
router.patch("/:id/deactivate", deactivateAdminCouponHandler);
router.delete("/:id", deleteAdminCouponHandler);

export default router;
