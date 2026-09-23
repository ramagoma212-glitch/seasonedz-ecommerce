// Milestone 181, Part J: public preorder programme settings — see
// preorder.controller.ts's own header comment. Deliberately no auth
// middleware at all, unlike adminPreorder.routes.ts.

import { Router } from "express";
import { getPublicPreorderSettingsHandler } from "../controllers/preorder.controller.js";
import { publicCache } from "../middleware/publicCache.middleware.js";

const router = Router();

// Milestone 190B, Part S: public, unauthenticated, read-only — see
// publicCache.middleware.ts's own header comment for the measured
// reasoning.
router.use(publicCache(60));

router.get("/settings", getPublicPreorderSettingsHandler);

export default router;
