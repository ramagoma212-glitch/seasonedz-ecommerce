import { Router } from "express";
import { getCategoryProducts, listCategories } from "../controllers/category.controller.js";
import { publicCache } from "../middleware/publicCache.middleware.js";
import { requestTimingMiddleware } from "../utils/serverTiming.js";

const router = Router();

// Milestone 190B, Part S: every route in this file is public,
// unauthenticated and read-only — see publicCache.middleware.ts's own
// header comment for the measured reasoning.
router.use(publicCache(60));
// Milestone 191, Part T: Server-Timing instrumentation for latency
// investigation — see serverTiming.ts's own header comment.
router.use(requestTimingMiddleware);

router.get("/", listCategories);
router.get("/:slug/products", getCategoryProducts);

export default router;
