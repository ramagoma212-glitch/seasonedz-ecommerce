// Version 7, Milestone 173. See courierWebhook.controller.ts's own
// header comment for the full security model — no dedicated rate
// limiter here, deliberately, matching payment.routes.ts's own
// /payfast/notify precedent: this is a server-to-server webhook that
// may legitimately retry, the general /api rate limiter still applies
// as a backstop, and the secret path segment (not IP-based throttling)
// is this route's real protection.
import { Router } from "express";
import { courierGuyTrackingWebhookHandler } from "../controllers/courierWebhook.controller.js";

const router = Router();

router.post("/courier-guy/:webhookSecret/tracking-event", courierGuyTrackingWebhookHandler);

export default router;
