// Customer auth routes (Version 7, Milestone 127 — backend foundation
// only). Mounted at /api/customers in routes/index.ts. Only
// register/login/logout/me exist for this milestone — no order
// history, no password reset yet (later milestones), and nothing here
// is linked from any public frontend page yet.

import { Router } from "express";
import { loginHandler, logoutHandler, meHandler, registerHandler } from "../controllers/customerAuth.controller.js";
import { requireCustomerAuth } from "../middleware/requireCustomerAuth.middleware.js";
import { customerLoginRateLimiter, customerRegisterRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/register", customerRegisterRateLimiter, registerHandler);
router.post("/login", customerLoginRateLimiter, loginHandler);
router.post("/logout", logoutHandler);
router.get("/me", requireCustomerAuth, meHandler);

export default router;
