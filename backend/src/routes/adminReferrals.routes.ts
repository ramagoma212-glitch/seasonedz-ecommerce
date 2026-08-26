// Version 7, Milestone 172B.3: admin routes for Seasonedz's own
// affiliate/referral programme. Mounted at /api/admin/referrals in
// routes/index.ts — a completely separate router and path from
// /api/admin/affiliate (172B's dormant, external-merchant
// AffiliateProduct admin area), so the two systems can never overlap
// or be reached through each other's routes.
//
// requireAdminAuth is applied once, at the router level, the same
// discipline every other admin router already follows. A
// CustomerSession cookie can never authenticate anything here — it's a
// completely separate table and cookie name from AdminSession.

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import {
  approveAffiliateHandler,
  createAffiliateHandler,
  getAffiliateHandler,
  getReferralsOverviewHandler,
  listAffiliatesHandler,
  reactivateAffiliateHandler,
  rejectAffiliateHandler,
  suspendAffiliateHandler,
  updateAffiliateHandler,
} from "../controllers/adminReferralAffiliate.controller.js";
import { getReferralSettingsHandler, updateReferralSettingsHandler } from "../controllers/adminReferralSettings.controller.js";
import {
  approveCommissionHandler,
  getOrderAffiliateCommissionHandler,
  getPayoutOverviewHandler,
  listOrderAffiliateCommissionsHandler,
  payAffiliateCommissionsHandler,
  reverseCommissionHandler,
} from "../controllers/adminReferralCommission.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/overview", getReferralsOverviewHandler);

router.get("/affiliates", listAffiliatesHandler);
router.post("/affiliates", createAffiliateHandler);
router.get("/affiliates/:id", getAffiliateHandler);
router.patch("/affiliates/:id", updateAffiliateHandler);
router.patch("/affiliates/:id/approve", approveAffiliateHandler);
router.patch("/affiliates/:id/reject", rejectAffiliateHandler);
router.patch("/affiliates/:id/suspend", suspendAffiliateHandler);
router.patch("/affiliates/:id/reactivate", reactivateAffiliateHandler);

// Deliberately no POST here — §8 of the brief: "not generic POST/create
// settings". GET reads (creating the singleton row with V1 defaults on
// first read if needed), PATCH updates it. There is no other way to
// reach this table through the API.
router.get("/settings", getReferralSettingsHandler);
router.patch("/settings", updateReferralSettingsHandler);

router.get("/commissions", listOrderAffiliateCommissionsHandler);
router.get("/commissions/:id", getOrderAffiliateCommissionHandler);
router.patch("/commissions/:id/approve", approveCommissionHandler);
router.patch("/commissions/:id/reverse", reverseCommissionHandler);

// Version 7, Milestone 172B.5: payout — grouped view over existing
// APPROVED commissions (no AffiliatePayout table; see
// referralCommission.service.ts's own header comment for why).
router.get("/payouts", getPayoutOverviewHandler);
router.post("/payouts/:affiliateId/pay", payAffiliateCommissionsHandler);

export default router;
