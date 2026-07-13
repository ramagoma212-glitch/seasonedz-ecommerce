import { Router } from "express";
import { getCategoryProducts, listCategories } from "../controllers/category.controller.js";

const router = Router();

router.get("/", listCategories);
router.get("/:slug/products", getCategoryProducts);

export default router;
