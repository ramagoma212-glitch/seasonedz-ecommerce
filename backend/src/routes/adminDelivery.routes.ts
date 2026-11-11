// Milestone 205: admin routes for delivery fee/threshold settings.
// Mounted at /api/admin/delivery-settings in routes/index.ts.
//
// requireAdminAuth is applied at the router level, same discipline
// every other admin router already follows.
//
// Deliberately no POST here — same reasoning as adminReferrals.routes.ts's
// own settings routes: GET reads (creating the singleton row with
// Milestone 205 defaults on first read if needed), PATCH updates it.
// There is no other way to reach this table through the API.

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import { getDeliverySettingsHandler, updateDeliverySettingsHandler } from "../controllers/adminDeliverySettings.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/", getDeliverySettingsHandler);
router.patch("/", updateDeliverySettingsHandler);

export default router;
