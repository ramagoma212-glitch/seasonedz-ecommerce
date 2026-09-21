// Milestone 189: admin welcome-gift asset management. Mounted at
// /api/admin/welcome-gift in routes/index.ts. requireAdminAuth applies
// to the whole router — same "any authenticated admin may manage
// content, no ADMIN-only role restriction" precedent as the existing
// per-product digital-asset upload routes in adminDashboard.routes.ts.
import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import {
  listWelcomeGiftAssetsHandler,
  uploadWelcomeGiftAssetHandler,
  uploadWelcomeGiftAssetMiddleware,
} from "../controllers/adminWelcomeGiftAsset.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/assets", listWelcomeGiftAssetsHandler);
router.post("/assets/:assetKey", uploadWelcomeGiftAssetMiddleware, uploadWelcomeGiftAssetHandler);

export default router;
