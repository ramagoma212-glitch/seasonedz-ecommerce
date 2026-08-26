// Version 7, Milestone 173: Courier Guy (ShipLogic) "Tracking event"
// webhook receiver.
// Version 7, Milestone 173A: switched from a secret-in-URL scheme to
// ShipLogic's own real, verified webhook authentication option —
// "Static bearer token" (confirmed directly from the production
// ShipLogic portal's webhook subscription form, Topic: "Parcel
// tracking event"). The route itself is now a fixed, public path; the
// secret lives only in the `Authorization: Bearer <token>` header,
// which ShipLogic's own portal sends when configured with the "Auth
// key" field — this is a genuine provider-native mechanism now, not
// this backend's own workaround.
//
// SECURITY MODEL. Missing/wrong-scheme/empty/incorrect/malformed
// Authorization is rejected with 401 — standard bearer-auth semantics,
// and there's no more "hide whether the route exists" rationale to
// preserve now that the URL itself carries no secret (a fixed webhook
// path is normal and expected to be discoverable, exactly like every
// other route in this API). When courier status sync itself is
// disabled (COURIER_GUY_STATUS_SYNC_ENABLED=false or no secret
// configured), the route stays inert with a 404 — the feature simply
// doesn't exist yet, same as before Milestone 173A.
//
// Once authenticated, every request still gets a 200 — including one
// this backend couldn't resolve to a genuine shipment, couldn't map to
// a known status, or was simply a duplicate/out-of-order event. None
// of those are the caller's fault (see courierStatusSync.service.ts's
// own header comment on the acknowledged status-vocabulary
// uncertainty), and returning anything else risks ShipLogic's own
// webhook-failure monitoring flagging a healthy integration as broken,
// or retry storms against a payload this backend will only ever parse
// the same way twice. Only a genuinely unexpected internal error
// reaches `next()`.
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

// Only ever reads the Authorization header — deliberately never a
// query parameter, URL segment, request body field, or cookie (brief
// section 4). "Bearer" is matched case-insensitively (RFC 7235 auth
// schemes are case-insensitive); everything else about the header must
// be exactly right or this returns null (rejected).
function parseBearerToken(headerValue: string | undefined): string | null {
  if (typeof headerValue !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  if (!match) return null;
  const token = match[1]!.trim();
  return token.length > 0 ? token : null;
}

export async function courierGuyTrackingWebhookHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const configuredSecret = courierGuyConfig.webhookSecret;

    if (!courierGuyConfig.statusSyncEnabled || !configuredSecret) {
      // Feature not active — stays indistinguishable from "route
      // doesn't exist", same as before Milestone 173A.
      res.status(404).end();
      return;
    }

    const providedToken = parseBearerToken(req.headers.authorization);
    if (!providedToken || !secretMatches(providedToken, configuredSecret)) {
      // Standard bearer-auth rejection — never logs the header/token
      // value, never echoes it back.
      res.status(401).json({ received: false, message: "Unauthorized" });
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
