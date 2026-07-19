// Admin auth routes (Version 7, Milestone 58 — foundation only).
// Mounted at /api/admin/auth in routes/index.ts. Only these three
// routes exist under /api/admin for this milestone — no orders,
// enquiries, customers or products are exposed here or anywhere else
// under /api/admin yet.

import { Router } from "express";
import { loginHandler, logoutHandler, meHandler } from "../controllers/adminAuth.controller.js";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import { adminLoginRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/login", adminLoginRateLimiter, loginHandler);
router.post("/logout", logoutHandler);
router.get("/me", requireAdminAuth, meHandler);

export default router;
