// PayFast signature generation and verification (Version 3,
// Milestones 21-22).
//
// Follows PayFast's "Custom Integration" signature rules:
//  1. Take the fields in the exact order they're going to be
//     submitted to PayFast (insertion order — not alphabetical) —
//     or, for verifying an inbound ITN, the exact order PayFast sent
//     them in its POST body, with the "signature" field itself
//     removed first.
//  2. Drop any field whose value is empty/undefined entirely (never
//     sign a blank value).
//  3. URL-encode each value the way PHP's urlencode() does — spaces
//     become "+", not "%20" — since that's what PayFast's own
//     integration examples are written against.
//  4. Join as "key=value&key=value...".
//  5. If the merchant account has a passphrase configured, append it
//     the same way as one more "&passphrase=..." pair.
//  6. MD5-hash the resulting string (lowercase hex).
//
// For outgoing payment initiation, the caller must build the exact
// same field object (same keys, same order, same values) that gets
// submitted to PayFast as a <form>, or the signature PayFast
// recomputes on its end won't match this one. For an inbound ITN, the
// signature PayFast sent must be recomputed from the fields it
// actually posted (minus "signature") to confirm it wasn't tampered
// with in transit — see verifyPayfastSignature below.

import { createHash, timingSafeEqual } from "node:crypto";

function payfastUrlEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

// Never log `fields` or the return value of this function anywhere —
// the encoded string it's computed from includes merchant_key and (if
// configured) the account passphrase.
export function generatePayfastSignature(fields: Record<string, string | undefined>, passphrase?: string): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === "") continue;
    parts.push(`${key}=${payfastUrlEncode(value)}`);
  }

  if (passphrase && passphrase.trim() !== "") {
    parts.push(`passphrase=${payfastUrlEncode(passphrase.trim())}`);
  }

  const signatureBaseString = parts.join("&");
  return createHash("md5").update(signatureBaseString).digest("hex");
}

// Verifies a signature PayFast sent on an inbound ITN. `fields` must be
// every field PayFast posted, in the order it posted them, with the
// "signature" field itself already removed by the caller — never just
// the subset of fields this backend happens to read, since PayFast
// signs the whole notification.
//
// Never log `fields`, `receivedSignature`, or this function's inputs —
// see the note on generatePayfastSignature above.
export function verifyPayfastSignature(
  fields: Record<string, string | undefined>,
  receivedSignature: string,
  passphrase?: string
): boolean {
  const expectedSignature = generatePayfastSignature(fields, passphrase);

  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  const receivedBuffer = Buffer.from(receivedSignature.trim().toLowerCase(), "hex");

  // Different lengths (e.g. a malformed/non-hex value PayFast — or an
  // attacker — sent) would make timingSafeEqual throw rather than
  // return false, so this is checked first, not as an optimisation.
  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
