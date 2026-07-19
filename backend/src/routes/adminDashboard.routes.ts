// Version 7, Milestone 59: read-only admin dashboard routes. Mounted at
// /api/admin in routes/index.ts (after /api/admin/auth, so the more
// specific auth router always matches auth requests first).
//
// requireAdminAuth is applied once, at the router level, rather than
// per-handler — the same discipline VERSION_7_ADMIN_DASHBOARD_PLAN.md
// calls for, so a route added later under this router can never
// accidentally ship unauthenticated. Every route below is a GET —
// no POST/PATCH/PUT/DELETE exists here, by design: this milestone is
// strictly read-only (no order status update, no enquiry status
// update, no product create/edit/delete).

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import {
  getDashboardHandler,
  getLowStockProductsHandler,
  getOrderDetailHandler,
  listEnquiriesHandler,
  listOrdersHandler,
} from "../controllers/adminDashboard.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/dashboard", getDashboardHandler);
router.get("/orders", listOrdersHandler);
router.get("/orders/:orderNumber", getOrderDetailHandler);
router.get("/enquiries", listEnquiriesHandler);
router.get("/products/low-stock", getLowStockProductsHandler);

export default router;
