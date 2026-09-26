// Milestone 198: signs/verifies the one-time link every outreach email's
// List-Unsubscribe header (and any in-body link) points at — Part 12 of
// this milestone's own brief is explicit that this must be a REAL,
// working mechanism, never a fake link that does nothing.
//
// Same stateless HMAC-SHA256 approach as referralAttributionToken.ts —
// no separate token table, nothing to expire/clean up. A verified
// signature proves "this backend genuinely issued a link for this
// contact id," nothing more; actually applying the unsubscribe is
// outreachContact.service.ts's job once the id is known to be genuine.
//
// Deliberately reuses env.referralAttributionSecret rather than
// introducing a new required-in-production env var: that secret is
// already mandatory and configured on Render (env.ts throws at startup
// in production if it's ever missing), so this feature needs zero new
// manual configuration to deploy correctly. Sharing one server secret
// across two unrelated HMAC purposes is standard and safe as long as
// the signed message itself is domain-separated (the "outreach-
// unsubscribe." prefix below vs referral capture's own "{code}.
// {capturedAt}" message) — a signature valid for one purpose can never
// be replayed as a valid signature for the other.

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

function computeSignature(contactId: string): string {
  return createHmac("sha256", env.referralAttributionSecret).update(`outreach-unsubscribe.${contactId}`).digest("hex");
}

export function signOutreachUnsubscribeToken(contactId: string): string {
  return `${contactId}.${computeSignature(contactId)}`;
}

// Returns the verified contact id, or null when the token is malformed,
// forged, or signed under a since-rotated secret. Never throws.
export function verifyOutreachUnsubscribeToken(rawToken: unknown): string | null {
  if (typeof rawToken !== "string" || rawToken.length === 0) return null;
  const separatorIndex = rawToken.lastIndexOf(".");
  if (separatorIndex <= 0) return null;

  const contactId = rawToken.slice(0, separatorIndex);
  const signature = rawToken.slice(separatorIndex + 1);
  const expected = computeSignature(contactId);

  let expectedBuffer: Buffer;
  let providedBuffer: Buffer;
  try {
    expectedBuffer = Buffer.from(expected, "hex");
    providedBuffer = Buffer.from(signature, "hex");
  } catch {
    return null;
  }
  if (expectedBuffer.length !== providedBuffer.length) return null;
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) return null;

  return contactId;
}
