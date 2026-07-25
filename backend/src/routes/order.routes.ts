import { Router } from "express";
import { createOrderHandler, getOrderHandler, getOrderTrackingHandler } from "../controllers/order.controller.js";
import { orderCreationRateLimiter } from "../middleware/rateLimit.middleware.js";
import { optionalCustomerAuth } from "../middleware/optionalCustomerAuth.middleware.js";

const router = Router();

// Version 7, Milestone 129: optionalCustomerAuth never rejects — a
// logged-in customer's order gets linked via req.customerUser, a guest
// checkout proceeds exactly as before. See createOrderHandler.
router.post("/", orderCreationRateLimiter, optionalCustomerAuth, createOrderHandler);
router.get("/:orderNumber/tracking", getOrderTrackingHandler);
router.get("/:orderNumber", getOrderHandler);

export default router;
