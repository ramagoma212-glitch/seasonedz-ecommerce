// Version 7, Milestone 172B.4: signs/verifies the {code, capturedAt}
// pair a storefront visitor's browser stores in Local Storage
// (seasonedz_referral) after following a ?ref=CODE link.
//
// The problem this solves: order.service.ts must enforce
// attributionWindowDays (how long a captured referral stays valid)
// against capturedAt, but capturedAt lives in the customer's own
// browser storage, which they can freely edit. A plain client-supplied
// timestamp could be edited to make a months-old capture look freshly
// captured forever, silently defeating the expiry control and letting
// one referral link keep discounting indefinitely. Signing capturedAt
// with a server-only secret at the moment of capture (see
// services/referralCapture.service.ts) makes that impossible: the
// client can carry the token around, but cannot alter capturedAt
// without invalidating the signature, since only this backend can ever
// produce a valid one for a given (code, capturedAt) pair.
//
// Deliberately stateless — no database table, no session row. HMAC-
// SHA256 needs no storage or lookup to verify, which is the smallest
// safe first-party mechanism that actually closes the gap above: no
// third party, nothing beyond Node's own built-in crypto module.
//
// This is a tamper-evidence control, not an authentication one — a
// verified signature proves "this backend genuinely issued this
// capturedAt for this code at some point," nothing more. An invalid or
// missing signature is never an error; it simply means "no referral
// applies," exactly like an unknown/expired/inactive one — see
// order.service.ts.

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

export interface SignedReferralCapture {
  code: string;
  capturedAt: string;
  signature: string;
}

function computeSignature(code: string, capturedAt: string): string {
  return createHmac("sha256", env.referralAttributionSecret).update(`${code}.${capturedAt}`).digest("hex");
}

export function signReferralCapture(code: string, capturedAt: Date = new Date()): SignedReferralCapture {
  const capturedAtIso = capturedAt.toISOString();
  return { code, capturedAt: capturedAtIso, signature: computeSignature(code, capturedAtIso) };
}

// Returns the verified capture, or null when the shape is wrong, the
// signature doesn't match (tampered, forged, or signed under a
// since-rotated secret), or capturedAt isn't a real date. Never throws.
export function verifyReferralCapture(raw: unknown): SignedReferralCapture | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { code, capturedAt, signature } = raw as Record<string, unknown>;
  if (typeof code !== "string" || typeof capturedAt !== "string" || typeof signature !== "string") return null;
  if (code.length === 0 || Number.isNaN(new Date(capturedAt).getTime())) return null;

  const expected = computeSignature(code, capturedAt);
  const expectedBuffer = Buffer.from(expected, "hex");
  let providedBuffer: Buffer;
  try {
    providedBuffer = Buffer.from(signature, "hex");
  } catch {
    return null;
  }
  // timingSafeEqual throws on mismatched lengths rather than returning
  // false — checked explicitly first so a garbage/short signature is a
  // clean "no match" instead of an uncaught exception.
  if (expectedBuffer.length !== providedBuffer.length) return null;
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) return null;

  return { code, capturedAt, signature };
}

// Fractional days — callers compare against an integer
// attributionWindowDays, e.g. `captureAgeInDays(...) > settings.attributionWindowDays`.
export function captureAgeInDays(capturedAt: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(capturedAt).getTime()) / (1000 * 60 * 60 * 24);
}
