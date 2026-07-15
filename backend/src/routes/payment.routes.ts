import { Router } from "express";
import { initiatePayfastPaymentHandler, payfastNotifyHandler } from "../controllers/payment.controller.js";
import { paymentInitiationRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/payfast/initiate", paymentInitiationRateLimiter, initiatePayfastPaymentHandler);

// No dedicated rate limiter here (deliberately) — this is a
// server-to-server webhook PayFast itself calls and may legitimately
// retry on a delay if it doesn't get a prompt 200; the general
// /api rate limiter (100 requests / 15 min / IP) still applies as a
// backstop. Nothing about this route trusts the caller — every field
// is independently verified in payfast.service.ts regardless of how
// many times it's called.
router.post("/payfast/notify", payfastNotifyHandler);

export default router;
