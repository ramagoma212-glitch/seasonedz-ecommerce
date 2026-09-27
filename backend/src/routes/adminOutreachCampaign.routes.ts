// Milestone 198: admin B2B outreach campaign lifecycle. requireAdminAuth
// applied once, at the router level, same discipline as every other
// admin router. Sending real email (test-send, batch-send, retry,
// cancel) is ADMIN-only — a STAFF account keeps full read/draft access
// via requireAdminAuth alone, the same split established for Referrals/
// Content Studio (see requireAdminRole.middleware.ts).

import { Router } from "express";
import { UserRole } from "@prisma/client";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import { requireAdminRole } from "../middleware/requireAdminRole.middleware.js";
import { outreachSendRateLimiter } from "../middleware/rateLimit.middleware.js";
import {
  buildRecipientsHandler,
  bulkPreviewHandler,
  bulkStartHandler,
  cancelCampaignHandler,
  createCampaignHandler,
  deleteCampaignHandler,
  getCampaignHandler,
  listCampaignsHandler,
  listRecipientsHandler,
  previewAudienceHandler,
  retryFailedHandler,
  sendBatchHandler,
  sendTestHandler,
  updateCampaignHandler,
} from "../controllers/adminOutreachCampaign.controller.js";

const router = Router();

router.use(requireAdminAuth);

const adminOnly = requireAdminRole(UserRole.ADMIN);

router.get("/", listCampaignsHandler);
router.post("/", createCampaignHandler);
router.post("/preview-audience", previewAudienceHandler);
// Milestone 198.1: multi-select bulk sending. Preview is a read-only
// STAFF-accessible calculation; the real bulk-start is ADMIN-only and
// rate-limited, same split as send-test/send-batch below.
router.post("/bulk-preview", bulkPreviewHandler);
router.post("/bulk-start", adminOnly, outreachSendRateLimiter, bulkStartHandler);
router.get("/:id", getCampaignHandler);
router.patch("/:id", updateCampaignHandler);
router.delete("/:id", deleteCampaignHandler);

router.post("/:id/build-recipients", buildRecipientsHandler);
router.get("/:id/recipients", listRecipientsHandler);

// Sending real email — ADMIN-only, and each of these three also has its
// own tight rate limiter (see rateLimit.middleware.ts).
router.post("/:id/send-test", adminOnly, outreachSendRateLimiter, sendTestHandler);
router.post("/:id/send-batch", adminOnly, outreachSendRateLimiter, sendBatchHandler);
router.post("/:id/retry-failed", adminOnly, retryFailedHandler);
router.post("/:id/cancel", adminOnly, cancelCampaignHandler);

export default router;
