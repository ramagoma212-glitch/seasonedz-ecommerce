// Version 7, Milestone 172B: admin affiliate-product management
// routes. Mounted at /api/admin/affiliate in routes/index.ts — a
// separate router file from adminDashboard.routes.ts (which was
// already large before this milestone), same reasoning as
// adminOrderStatus/adminShipping/adminCourier being their own
// controllers rather than folded into one file.
//
// requireAdminAuth is applied once, at the router level — the same
// discipline every other admin router already follows, so a route
// added here later can never accidentally ship unauthenticated. A
// CustomerSession cookie can never satisfy this: it's a completely
// separate table and cookie name from AdminSession (see
// requireAdminAuth.middleware.ts), so customer/admin auth isolation is
// structural here, not just a runtime check.
//
// No public route is mounted here, and none should be — the public
// read API and the /go/:trackingSlug redirect are Milestone 172C.

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import {
  activateAdminAffiliateProductHandler,
  createAdminAffiliateProductHandler,
  deactivateAdminAffiliateProductHandler,
  featureAdminAffiliateProductHandler,
  getAdminAffiliateProductHandler,
  listAdminAffiliateProductsHandler,
  unfeatureAdminAffiliateProductHandler,
  updateAdminAffiliateProductHandler,
} from "../controllers/adminAffiliateProduct.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/products", listAdminAffiliateProductsHandler);
router.post("/products", createAdminAffiliateProductHandler);
router.get("/products/:id", getAdminAffiliateProductHandler);
router.patch("/products/:id", updateAdminAffiliateProductHandler);
router.patch("/products/:id/activate", activateAdminAffiliateProductHandler);
router.patch("/products/:id/deactivate", deactivateAdminAffiliateProductHandler);
router.patch("/products/:id/feature", featureAdminAffiliateProductHandler);
router.patch("/products/:id/unfeature", unfeatureAdminAffiliateProductHandler);

export default router;
