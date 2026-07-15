import { Router } from "express";
import { createEnquiryHandler, getEnquiryStatusHandler } from "../controllers/enquiry.controller.js";
import { enquiryCreationRateLimiter } from "../middleware/rateLimit.middleware.js";

const router = Router();

router.post("/", enquiryCreationRateLimiter, createEnquiryHandler);
router.get("/:id/status", getEnquiryStatusHandler);

export default router;
