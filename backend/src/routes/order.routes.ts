import { Router } from "express";
import { createOrderHandler, getOrderHandler, getOrderTrackingHandler, previewPreorderDiscountHandler } from "../controllers/order.controller.js";
import { orderCreationRateLimiter } from "../middleware/rateLimit.middleware.js";
import { optionalCustomerAuth } from "../middleware/optionalCustomerAuth.middleware.js";

const router = Router();

// Version 7, Milestone 129: optionalCustomerAuth never rejects — a
// logged-in customer's order gets linked via req.customerUser, a guest
// checkout proceeds exactly as before. See createOrderHandler.
router.post("/", orderCreationRateLimiter, optionalCustomerAuth, createOrderHandler);
// Milestone 181, Part L: read-only preview, no rate limit needed beyond
// the general API limiter — never creates or reserves anything.
router.post("/preorder-discount-preview", optionalCustomerAuth, previewPreorderDiscountHandler);
router.get("/:orderNumber/tracking", getOrderTrackingHandler);
router.get("/:orderNumber", getOrderHandler);

export default router;
