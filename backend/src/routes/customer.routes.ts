// Customer auth + order history routes (Version 7, Milestone 127
// backend foundation; order history added Milestone 130). Mounted at
// /api/customers in routes/index.ts. Password reset is still a later
// milestone.

import { Router } from "express";
import { loginHandler, logoutHandler, meHandler, registerHandler } from "../controllers/customerAuth.controller.js";
import { getCustomerOrderHandler, listCustomerOrdersHandler } from "../controllers/customerOrder.controller.js";
import { requireCustomerAuth } from "../middleware/requireCustomerAuth.middleware.js";
import { customerLoginRateLimiter, customerRegisterRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/register", customerRegisterRateLimiter, registerHandler);
router.post("/login", customerLoginRateLimiter, loginHandler);
router.post("/logout", logoutHandler);
router.get("/me", requireCustomerAuth, meHandler);

// Version 7, Milestone 130: both require requireCustomerAuth — a
// logged-out request never reaches customerOrder.controller.ts at all.
router.get("/orders", requireCustomerAuth, listCustomerOrdersHandler);
router.get("/orders/:orderNumber", requireCustomerAuth, getCustomerOrderHandler);

export default router;
