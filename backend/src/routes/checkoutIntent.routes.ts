// Version 7, Milestone 174C: abandoned checkout recovery — public,
// unauthenticated (a guest checkout is the primary case), mounted at
// /api/checkout-intent in routes/index.ts. See
// checkoutIntent.controller.ts's own header comment.
import { Router } from "express";
import { captureCheckoutIntentHandler, recoverCheckoutIntentHandler } from "../controllers/checkoutIntent.controller.js";
import { optionalCustomerAuth } from "../middleware/optionalCustomerAuth.middleware.js";
import { checkoutIntentRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/", optionalCustomerAuth, checkoutIntentRateLimiter, captureCheckoutIntentHandler);
router.get("/recover/:token", recoverCheckoutIntentHandler);

export default router;
