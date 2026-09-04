// Milestone 181, Part J: public preorder programme settings — see
// preorder.controller.ts's own header comment. Deliberately no auth
// middleware at all, unlike adminPreorder.routes.ts.

import { Router } from "express";
import { getPublicPreorderSettingsHandler } from "../controllers/preorder.controller.js";

const router = Router();

router.get("/settings", getPublicPreorderSettingsHandler);

export default router;
