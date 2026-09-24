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
import { previewWelcomeGiftBulkSendHandler, runWelcomeGiftBulkSendHandler } from "../controllers/adminWelcomeGiftBulkSend.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/assets", listWelcomeGiftAssetsHandler);
router.post("/assets/:assetKey", uploadWelcomeGiftAssetMiddleware, uploadWelcomeGiftAssetHandler);

// Sends the existing three-sample welcome gift to every current
// account holder and guest-checkout email who predates the automatic
// trigger (Milestone 189 only fires going forward). GET is a safe,
// read-only preview (counts only, no send); POST performs the actual
// send. Reuses the exact same one-time-delivery-guaranteed functions
// the automatic trigger already uses in production, so nobody who has
// already received it is ever sent it twice.
router.get("/bulk-send/preview", previewWelcomeGiftBulkSendHandler);
router.post("/bulk-send", runWelcomeGiftBulkSendHandler);

export default router;
