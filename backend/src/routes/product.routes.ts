import { Router } from "express";
import { getProduct, listBestSellers, listFeaturedProducts, listNewArrivals, listProducts } from "../controllers/product.controller.js";

const router = Router();

// The fixed sub-paths must be registered before the dynamic /:slug
// route, otherwise Express would match e.g. "featured" as a slug.
router.get("/", listProducts);
router.get("/featured", listFeaturedProducts);
router.get("/best-sellers", listBestSellers);
router.get("/new-arrivals", listNewArrivals);
router.get("/:slug", getProduct);

export default router;
