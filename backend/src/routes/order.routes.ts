import { Router } from "express";
import { createOrderHandler, getOrderHandler, getOrderTrackingHandler } from "../controllers/order.controller.js";

const router = Router();

router.post("/", createOrderHandler);
router.get("/:orderNumber/tracking", getOrderTrackingHandler);
router.get("/:orderNumber", getOrderHandler);

export default router;
