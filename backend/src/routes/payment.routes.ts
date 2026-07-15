import { Router } from "express";
import { initiatePayfastPaymentHandler } from "../controllers/payment.controller.js";
import { paymentInitiationRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/payfast/initiate", paymentInitiationRateLimiter, initiatePayfastPaymentHandler);

export default router;
