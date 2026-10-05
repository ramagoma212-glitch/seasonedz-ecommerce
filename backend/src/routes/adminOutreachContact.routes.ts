// Milestone 198: admin B2B outreach contact management. requireAdminAuth
// applied once, at the router level, the same discipline every other
// admin router already follows. Bulk import (a genuine bulk write) is
// its own tighter rate limiter — see rateLimit.middleware.ts.

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import { outreachImportRateLimiter, outreachSendRateLimiter } from "../middleware/rateLimit.middleware.js";
import { requireAdminRole } from "../middleware/requireAdminRole.middleware.js";
import { UserRole } from "@prisma/client";
import {
  followUpComposerHandler,
  followUpPreviewHandler,
  followUpQueueHandler,
  followUpReconcileHandler,
  followUpSendHandler,
} from "../controllers/adminOutreachFollowUp.controller.js";
import {
  completeFollowUpHandler,
  getContactCrmDetailHandler,
  getContactTimelineHandler,
  linkOrderHandler,
  markCustomerHandler,
  markRepeatCustomerHandler,
  recordActivityHandler,
  recordCatalogueSentHandler,
  setFollowUpHandler,
} from "../controllers/adminOutreachCrm.controller.js";
import {
  commitImportHandler,
  createContactHandler,
  deleteContactHandler,
  getContactHandler,
  getContactHistoryHandler,
  getCrmSummaryHandler,
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
// Milestone 199: a dedicated CRM summary endpoint, never folded into
// listContactsHandler above — the counts here are always global (every
// contact, independent of whatever page/filter the contacts list is
// currently showing).
router.get("/crm-summary", getCrmSummaryHandler);
// Milestone 202: the Needs Follow-up queue. Registered before /:id.
router.get("/follow-up-queue", followUpQueueHandler);
router.post("/import/preview", outreachImportRateLimiter, previewImportHandler);
router.post("/import/commit", outreachImportRateLimiter, commitImportHandler);
router.post("/", createContactHandler);
router.get("/:id", getContactHandler);
// Milestone 199: a dedicated history endpoint, not an expansion of
// getContactHandler's own payload — keeps the existing edit-form's
// GET /:id response exactly as it already was.
router.get("/:id/history", getContactHistoryHandler);
router.patch("/:id", updateContactHandler);
router.patch("/:id/status", setContactStatusHandler);
// Milestone 201: CRM sales workflow. Each of these is one explicit admin
// action. None of them touches OutreachContact.status (email eligibility).
router.get("/:id/crm-detail", getContactCrmDetailHandler);
router.get("/:id/timeline", getContactTimelineHandler);
router.post("/:id/activities", recordActivityHandler);
router.patch("/:id/follow-up", setFollowUpHandler);
router.post("/:id/follow-up/complete", completeFollowUpHandler);
router.post("/:id/catalogue-sent", recordCatalogueSentHandler);
router.post("/:id/orders/:orderId/link", linkOrderHandler);
router.post("/:id/orders/:orderId/mark-customer", markCustomerHandler);
router.post("/:id/mark-repeat-customer", markRepeatCustomerHandler);
// Milestone 202: individual follow-up emails. Preview and composer only read;
// sending and reconciling are ADMIN-only, the same role that sends campaigns.
const adminOnly = requireAdminRole(UserRole.ADMIN);
router.get("/:id/follow-up", followUpComposerHandler);
router.post("/:id/follow-up/preview", followUpPreviewHandler);
router.post("/:id/follow-up/send", adminOnly, outreachSendRateLimiter, followUpSendHandler);
router.post("/:id/follow-up/attempts/:attemptId/reconcile", adminOnly, followUpReconcileHandler);
router.delete("/:id", deleteContactHandler);

export default router;
