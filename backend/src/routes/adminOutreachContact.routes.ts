// Milestone 198: admin B2B outreach contact management. requireAdminAuth
// applied once, at the router level, the same discipline every other
// admin router already follows. Bulk import (a genuine bulk write) is
// its own tighter rate limiter — see rateLimit.middleware.ts.

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import { outreachImportRateLimiter } from "../middleware/rateLimit.middleware.js";
import {
  commitImportHandler,
  createContactHandler,
  deleteContactHandler,
  getContactHandler,
  listContactsHandler,
  listDistinctContactValuesHandler,
  previewImportHandler,
  setContactStatusHandler,
  updateContactHandler,
} from "../controllers/adminOutreachContact.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/", listContactsHandler);
router.get("/distinct-values", listDistinctContactValuesHandler);
router.post("/import/preview", outreachImportRateLimiter, previewImportHandler);
router.post("/import/commit", outreachImportRateLimiter, commitImportHandler);
router.post("/", createContactHandler);
router.get("/:id", getContactHandler);
router.patch("/:id", updateContactHandler);
router.patch("/:id/status", setContactStatusHandler);
router.delete("/:id", deleteContactHandler);

export default router;
