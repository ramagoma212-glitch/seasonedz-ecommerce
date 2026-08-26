// Version 7, Milestone 173, updated 173A. See courierWebhook.controller.ts's
// own header comment for the full security model — no dedicated rate
// limiter here, deliberately, matching payment.routes.ts's own
// /payfast/notify precedent: this is a server-to-server webhook that
// may legitimately retry, the general /api rate limiter still applies
// as a backstop, and the Authorization: Bearer token (not IP-based
// throttling, and no longer a secret URL segment — see 173A) is this
// route's real protection.
import { Router } from "express";
import { courierGuyTrackingWebhookHandler } from "../controllers/courierWebhook.controller.js";

const router = Router();

router.post("/courier-guy/tracking-event", courierGuyTrackingWebhookHandler);

export default router;
