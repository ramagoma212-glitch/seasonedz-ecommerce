// Version 7, Milestones 59 & 63: admin dashboard routes. Mounted at
// /api/admin in routes/index.ts (after /api/admin/auth, so the more
// specific auth router always matches auth requests first).
//
// requireAdminAuth is applied once, at the router level, rather than
// per-handler — the same discipline VERSION_7_ADMIN_DASHBOARD_PLAN.md
// calls for, so a route added later under this router can never
// accidentally ship unauthenticated.
//
// Every route was a GET until Milestone 63, which adds exactly one
// write route (order status update) — still no enquiry update, no
// product create/edit/delete, no delete action of any kind anywhere
// under /api/admin.

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import {
  getDashboardHandler,
  getLowStockProductsHandler,
  getOrderDetailHandler,
  listEnquiriesHandler,
  listOrdersHandler,
} from "../controllers/adminDashboard.controller.js";
import { updateOrderStatusHandler } from "../controllers/adminOrderStatus.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/dashboard", getDashboardHandler);
router.get("/orders", listOrdersHandler);
router.get("/orders/:orderNumber", getOrderDetailHandler);
router.patch("/orders/:orderNumber/status", updateOrderStatusHandler);
router.get("/enquiries", listEnquiriesHandler);
router.get("/products/low-stock", getLowStockProductsHandler);

export default router;
