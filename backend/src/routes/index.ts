// All API routes mount here, and this router mounts at /api in app.ts —
// so this file becomes the single place to see every route group that
// exists (e.g. /api/health). New route groups (products, orders, etc.
// in later milestones) get added here the same way.

import { Router } from "express";
import healthRoutes from "./health.routes.js";

const router = Router();

router.use("/health", healthRoutes);

export default router;
