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

const router = Router();

router.use("/health", healthRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/orders", orderRoutes);
router.use("/enquiries", enquiryRoutes);
router.use("/payments", paymentRoutes);
// Version 7, Milestone 58: admin auth foundation only — login/logout/
// me. No order, enquiry, customer or product admin data exists under
// /api/admin yet; every other /api/admin/* path is a 404 today.
router.use("/admin/auth", adminAuthRoutes);

export default router;
