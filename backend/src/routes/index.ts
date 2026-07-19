// All API routes mount here, and this router mounts at /api in app.ts —
// so this file becomes the single place to see every route group that
// exists (e.g. /api/health). New route groups (products, orders, etc.
// in later milestones) get added here the same way.

import { Router } from "express";
import healthRoutes from "./health.routes.js";
import productRoutes from "./product.routes.js";
import categoryRoutes from "./category.routes.js";
import orderRoutes from "./order.routes.js";
import enquiryRoutes from "./enquiry.routes.js";
import paymentRoutes from "./payment.routes.js";
import adminAuthRoutes from "./adminAuth.routes.js";
import adminDashboardRoutes from "./adminDashboard.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/orders", orderRoutes);
router.use("/enquiries", enquiryRoutes);
router.use("/payments", paymentRoutes);
// Version 7, Milestone 58: admin auth — login/logout/me.
router.use("/admin/auth", adminAuthRoutes);
// Version 7, Milestone 59: read-only admin dashboard (overview, order
// list/detail, enquiry list, low-stock products). Every route here is
// a GET, protected end-to-end by requireAdminAuth (applied at the
// router level in adminDashboard.routes.ts) — no write/mutation admin
// route exists anywhere under /api/admin yet.
router.use("/admin", adminDashboardRoutes);

export default router;
