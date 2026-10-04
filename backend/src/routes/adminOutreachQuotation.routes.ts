// Milestone 201: admin B2B quotations. requireAdminAuth is applied once at
// the router level. Every action that sends, finalises or cancels a
// quotation, or resolves an unconfirmed send, also requires the highest admin
// role (ADMIN) server-side, so a STAFF session is refused even on a direct API
// call. Creating and editing drafts, duplicating, and viewing or downloading
// the PDF remain open to any admin. Literal paths (/summary) are registered
// before the /:id parameter routes.

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import { requireAdminRole } from "../middleware/requireAdminRole.middleware.js";
import {
  createQuotationHandler,
  duplicateQuotationHandler,
  getQuotationHandler,
  listQuotationsHandler,
  quotationPdfHandler,
  quotationSummaryHandler,
  reconcileQuotationSendHandler,
  sendQuotationHandler,
  transitionHandlerFor,
  updateQuotationHandler,
} from "../controllers/adminOutreachQuotation.controller.js";

const router = Router();
const requireHighestRole = requireAdminRole("ADMIN");

router.use(requireAdminAuth);

router.get("/", listQuotationsHandler);
router.get("/summary", quotationSummaryHandler);
router.post("/", createQuotationHandler);
router.get("/:id", getQuotationHandler);
router.patch("/:id", updateQuotationHandler);
router.get("/:id/pdf", quotationPdfHandler);
router.post("/:id/duplicate", duplicateQuotationHandler);
router.post("/:id/send", requireHighestRole, sendQuotationHandler);
router.post("/:id/reconcile", requireHighestRole, reconcileQuotationSendHandler);
router.post("/:id/accept", requireHighestRole, transitionHandlerFor("accept"));
router.post("/:id/decline", requireHighestRole, transitionHandlerFor("decline"));
router.post("/:id/expire", requireHighestRole, transitionHandlerFor("expire"));
router.post("/:id/cancel", requireHighestRole, transitionHandlerFor("cancel"));

export default router;
