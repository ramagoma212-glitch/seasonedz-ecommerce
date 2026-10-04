// Milestone 201: admin B2B quotations. requireAdminAuth is applied once at
// the router level, the same discipline as adminOutreachContact.routes.ts.
// Literal paths (/summary) are registered before the /:id parameter routes.

import { Router } from "express";
import { requireAdminAuth } from "../middleware/requireAdminAuth.middleware.js";
import {
  createQuotationHandler,
  duplicateQuotationHandler,
  getQuotationHandler,
  listQuotationsHandler,
  quotationPdfHandler,
  quotationSummaryHandler,
  sendQuotationHandler,
  transitionHandlerFor,
  updateQuotationHandler,
} from "../controllers/adminOutreachQuotation.controller.js";

const router = Router();

router.use(requireAdminAuth);

router.get("/", listQuotationsHandler);
router.get("/summary", quotationSummaryHandler);
router.post("/", createQuotationHandler);
router.get("/:id", getQuotationHandler);
router.patch("/:id", updateQuotationHandler);
router.get("/:id/pdf", quotationPdfHandler);
router.post("/:id/duplicate", duplicateQuotationHandler);
router.post("/:id/send", sendQuotationHandler);
router.post("/:id/accept", transitionHandlerFor("accept"));
router.post("/:id/decline", transitionHandlerFor("decline"));
router.post("/:id/expire", transitionHandlerFor("expire"));
router.post("/:id/cancel", transitionHandlerFor("cancel"));

export default router;
