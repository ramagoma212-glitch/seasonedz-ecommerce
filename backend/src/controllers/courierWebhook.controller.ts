// Version 7, Milestone 173: Courier Guy (ShipLogic) "Tracking event"
// webhook receiver.
//
// SECURITY MODEL — read before touching this file. ShipLogic's own
// portal documentation (the only documentation this project could
// access — see courierWebhook.service.ts's own header comment) does
// not describe any signature/HMAC/token mechanism for inbound webhook
// requests, so this backend does not invent one and does not pretend
// ShipLogic authenticates its own calls. Instead, the callback URL
// registered in the ShipLogic portal embeds a long, random secret path
// segment (COURIER_GUY_WEBHOOK_SECRET) that only this backend and
// whoever configured the ShipLogic portal know. A request whose path
// segment doesn't match gets a plain 404 — indistinguishable from the
// route not existing at all, so a prober learns nothing about whether
// courier sync is even enabled. This is the well-established "secret
// URL" pattern for a provider with no native webhook auth, not a
// Courier-Guy-issued credential.
//
// Once past that gate, every request gets a 200 — including one this
// backend couldn't resolve to a genuine shipment, couldn't map to a
// known status, or was simply a duplicate/out-of-order event. None of
// those are the caller's fault (see courierStatusSync.service.ts's own
// header comment on the acknowledged status-vocabulary uncertainty),
// and returning anything else risks ShipLogic's own webhook-failure
// monitoring flagging a healthy integration as broken, or retry storms
// against a payload this backend will only ever parse the same way
// twice. Only a genuinely unexpected internal error reaches `next()`.
import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { courierGuyConfig } from "../config/courierGuy.js";
import { applyCourierStatusEvent } from "../services/courierStatusSync.service.js";
import { parseCourierWebhookPayload, safeShapeSummary } from "../services/courierWebhook.service.js";

function secretMatches(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export async function courierGuyTrackingWebhookHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const providedSecret = typeof req.params.webhookSecret === "string" ? req.params.webhookSecret : "";
    const configuredSecret = courierGuyConfig.webhookSecret;

    if (!courierGuyConfig.statusSyncEnabled || !configuredSecret || !secretMatches(providedSecret, configuredSecret)) {
      // Deliberately identical to "route not found" — see this file's
      // header comment.
      res.status(404).end();
      return;
    }

    const parsed = parseCourierWebhookPayload(req.body);
    const result = await applyCourierStatusEvent({
      candidateIdentifiers: parsed.candidateIdentifiers,
      rawStatus: parsed.rawStatus,
      providerEventAt: parsed.providerEventAt,
    });

    if (result.outcome === "unresolved_shipment") {
      // eslint-disable-next-line no-console
      console.warn(`[courier-status-sync] webhook event did not match any stored shipment. payload shape: ${safeShapeSummary(req.body)}`);
    } else if (result.outcome === "unmapped_status") {
      // eslint-disable-next-line no-console
      console.warn(`[courier-status-sync] unrecognised status "${result.rawStatus}" received. payload shape: ${safeShapeSummary(req.body)}`);
    } else if (result.outcome === "applied") {
      // eslint-disable-next-line no-console
      console.log(
        `[courier-status-sync] order=${result.orderNumber} stage=${result.stage} orderStatusChanged=${result.orderStatusChanged} shippingStatusChanged=${result.shippingStatusChanged}`
      );
    } else if (result.outcome === "informational") {
      // eslint-disable-next-line no-console
      console.log(`[courier-status-sync] order=${result.orderNumber} stage=${result.stage} (informational only — needs admin attention)`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}
