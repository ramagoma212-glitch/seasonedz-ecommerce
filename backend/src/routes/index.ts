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

const router = Router();

router.use("/health", healthRoutes);
router.use("/products", productRoutes);
router.use("/categories", categoryRoutes);
router.use("/orders", orderRoutes);
router.use("/enquiries", enquiryRoutes);
router.use("/payments", paymentRoutes);

export default router;
