import { Router } from "express";
import { getCategoryProducts, listCategories } from "../controllers/category.controller.js";
import { publicCache } from "../middleware/publicCache.middleware.js";

const router = Router();

// Milestone 190B, Part S: every route in this file is public,
// unauthenticated and read-only — see publicCache.middleware.ts's own
// header comment for the measured reasoning.
router.use(publicCache(60));

router.get("/", listCategories);
router.get("/:slug/products", getCategoryProducts);

export default router;
