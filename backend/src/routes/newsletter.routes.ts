import { Router } from "express";
import { subscribeToNewsletterHandler } from "../controllers/newsletter.controller.js";
import { newsletterSubscribeRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/subscribe", newsletterSubscribeRateLimiter, subscribeToNewsletterHandler);

export default router;
