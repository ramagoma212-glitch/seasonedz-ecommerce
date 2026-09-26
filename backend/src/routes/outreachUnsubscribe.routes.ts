// Milestone 198: the public, unauthenticated outreach unsubscribe link
// every campaign email points at. GET so it works as a plain clickable
// link from any mail client — no admin auth, no customer auth, nothing
// but a signed token in the query string.

import { Router } from "express";
import { outreachUnsubscribeRateLimiter } from "../middleware/rateLimit.middleware.js";
import { unsubscribeOutreachContactHandler } from "../controllers/outreachUnsubscribe.controller.js";

const router = Router();

router.get("/unsubscribe", outreachUnsubscribeRateLimiter, unsubscribeOutreachContactHandler);

export default router;
