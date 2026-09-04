// Milestone 181, Part D: admin preorder programme settings. Mounted at
// /api/admin/preorder in routes/index.ts. requireAdminAuth applies to
// the whole router (STAFF may view); PATCH is additionally ADMIN-only
// (brief Part D: "Only ADMIN may modify programme-level financial
// settings"), same requireAdminRole pattern Content Studio/Affiliate
// Products already established.

import { Router } from "express";
import { UserRole } from "@prisma/client";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import { requireAdminRole } from "../middleware/requireAdminRole.middleware.js";
import { getPreorderSettingsHandler, updatePreorderSettingsHandler } from "../controllers/adminPreorder.controller.js";

const router = Router();

router.use(requireAdminAuth);

// Deliberately no POST here — same "not generic create settings"
// discipline as adminReferrals.routes.ts's own /settings pair.
router.get("/settings", getPreorderSettingsHandler);
router.patch("/settings", requireAdminRole(UserRole.ADMIN), updatePreorderSettingsHandler);

export default router;
