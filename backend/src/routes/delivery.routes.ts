// Milestone 205: public delivery settings — mirrors preorder.routes.ts
// exactly. Deliberately no auth middleware at all, unlike
// adminDelivery.routes.ts.

import { Router } from "express";
import { getPublicDeliverySettingsHandler } from "../controllers/delivery.controller.js";
import { publicCache } from "../middleware/publicCache.middleware.js";
import { requestTimingMiddleware } from "../utils/serverTiming.js";

const router = Router();

router.use(publicCache(60));
router.use(requestTimingMiddleware);

router.get("/settings", getPublicDeliverySettingsHandler);

export default router;
