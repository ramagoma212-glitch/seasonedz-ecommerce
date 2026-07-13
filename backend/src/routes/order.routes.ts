import { Router } from "express";
import { createOrderHandler, getOrderHandler, getOrderTrackingHandler } from "../controllers/order.controller.js";
import { orderCreationRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/", orderCreationRateLimiter, createOrderHandler);
router.get("/:orderNumber/tracking", getOrderTrackingHandler);
router.get("/:orderNumber", getOrderHandler);

export default router;
