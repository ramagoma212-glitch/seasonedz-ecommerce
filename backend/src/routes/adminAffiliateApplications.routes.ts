// Version 7, Milestone 176: admin affiliate application review routes.
// Mounted at /api/admin/affiliate-applications in routes/index.ts — a
// separate router/path from /api/admin/referrals (the existing
// Affiliate list/approve/reject/suspend management), so this new,
// larger review surface doesn't bloat that router further. requireAdminAuth
// is applied once, at the router level, same discipline every other
// admin router already follows (brief section 49: "backend role/session
// authority required").

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import {
  approveApplicationHandler,
  getApplicationEventsHandler,
  getApplicationHandler,
  getApplicationsOverviewHandler,
  getDocumentSignedUrlHandler,
  listApplicationsHandler,
  rejectApplicationHandler,
  requestCorrectionHandler,
  revealIdentityNumberHandler,
} from "../controllers/adminAffiliateApplication.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/overview", getApplicationsOverviewHandler);
router.get("/", listApplicationsHandler);
router.get("/:id", getApplicationHandler);
router.get("/:id/events", getApplicationEventsHandler);
router.get("/:id/identity-number", revealIdentityNumberHandler);
router.get("/:id/documents/:documentId/signed-url", getDocumentSignedUrlHandler);
router.patch("/:id/request-correction", requestCorrectionHandler);
router.patch("/:id/approve", approveApplicationHandler);
router.patch("/:id/reject", rejectApplicationHandler);

export default router;
