import { Router } from "express";
import { getProduct, listBestSellers, listFeaturedProducts, listNewArrivals, listProducts } from "../controllers/product.controller.js";
import { listPublicProductReviewsHandler } from "../controllers/productReview.controller.js";
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

// The fixed sub-paths must be registered before the dynamic /:slug
// route, otherwise Express would match e.g. "featured" as a slug.
router.get("/", listProducts);
router.get("/featured", listFeaturedProducts);
router.get("/best-sellers", listBestSellers);
router.get("/new-arrivals", listNewArrivals);
router.get("/:slug", getProduct);
// Version 7, Milestone 171C: genuine, approved-only product reviews —
// public, unauthenticated, read-only. One more path segment than
// "/:slug" above, so no route-ordering conflict (same reasoning as the
// admin product image/digital-asset sub-routes in adminDashboard.routes.ts).
router.get("/:slug/reviews", listPublicProductReviewsHandler);

export default router;
