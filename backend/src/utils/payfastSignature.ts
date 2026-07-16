// PayFast signature generation and verification (Version 3,
// Milestones 21-22; empty-field handling corrected in Version 4,
// Milestone 30 after a real hosted sandbox round trip revealed it).
//
// Follows PayFast's "Custom Integration" signature rules:
//  1. Take the fields in the exact order they're going to be
//     submitted to PayFast (insertion order — not alphabetical) —
//     or, for verifying an inbound ITN, the exact order PayFast sent
//     them in its POST body, with the "signature" field itself
//     removed first.
//  2. Drop any field that's entirely absent as a key. Whether an
//     empty-VALUE field (present as `key=`, e.g. an unused
//     custom_str1) should also be dropped differs by direction — see
//     `skipEmptyValues` below; this is *not* symmetric between the two
//     directions despite using the same signing algorithm.
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
// recomputes on its end won't match this one. Initiation only ever
// builds fields it actually uses — an unused optional field (e.g.
// cell_number) is never added to the object at all, so "skip
// empty/undefined" and "skip absent" coincide here, which is why this
// went uncaught until the ITN direction was tested for real.
//
// For an inbound ITN, the signature PayFast sent must be recomputed
// from the fields it actually posted (minus "signature") to confirm
// it wasn't tampered with in transit — see verifyPayfastSignature
// below. PayFast's ITN always posts a fixed schema, including optional
// fields like custom_str1-5/custom_int1-5 as empty-VALUE keys
// (`custom_str1=`) when unused, and — confirmed empirically against a
// real hosted sandbox payment, Milestone 30 — *does* include those
// empty-valued keys in its own signature. Dropping them here (as
// generatePayfastSignature's default does, matching initiation's
// needs) silently produced a different hash and made every real ITN
// fail signature verification, regardless of merchant credentials.

import { createHash, timingSafeEqual } from "node:crypto";

// encodeURIComponent leaves `! ' ( ) *  ~` unescaped, but PHP's urlencode()
// — what PayFast's signature spec is actually built on — escapes all six.
// Left as encodeURIComponent produces them, a value containing any of these
// (e.g. "item(s)" in payfast.service.ts's item_description) signs
// differently here than PayFast's own server recomputes it, so real ITNs/
// initiations with such characters would fail signature verification even
// though this function is internally self-consistent. Discovered via the
// real hosted sandbox round trip (Version 4, Milestone 30) — no amount of
// crafted-signature self-testing (Milestone 22) could have caught this,
// since that only ever checked this function against itself.
const PHP_URLENCODE_EXTRA: Record<string, string> = {
  "!": "%21",
  "'": "%27",
  "(": "%28",
  ")": "%29",
  "*": "%2A",
  "~": "%7E",
};

function payfastUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, "+")
    .replace(/[!'()*~]/g, (char) => PHP_URLENCODE_EXTRA[char] ?? char);
}

// Never log `fields` or the return value of this function anywhere —
// the encoded string it's computed from includes merchant_key and (if
// configured) the account passphrase.
//
// `skipEmptyValues` (default true) drops fields with an empty-string
// value, matching what initiatePayfastPayment needs (it never adds an
// unused optional field to `fields` at all, so this only ever affects
// the rare case of an explicitly-empty value). verifyPayfastSignature
// below passes `false` — PayFast's own ITN signature includes its
// empty-valued optional fields, confirmed against a real hosted
// sandbox payment (Milestone 30) — so recomputing it must too.
export function generatePayfastSignature(
  fields: Record<string, string | undefined>,
  passphrase?: string,
  options: { skipEmptyValues?: boolean } = {}
): string {
  const { skipEmptyValues = true } = options;
  const parts: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (skipEmptyValues && value === "") continue;
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
// signs the whole notification. Empty-valued fields (e.g. an unused
// custom_str1) are deliberately kept, not dropped — see
// generatePayfastSignature's `skipEmptyValues` note above.
//
// Never log `fields`, `receivedSignature`, or this function's inputs —
// see the note on generatePayfastSignature above.
export function verifyPayfastSignature(
  fields: Record<string, string | undefined>,
  receivedSignature: string,
  passphrase?: string
): boolean {
  const expectedSignature = generatePayfastSignature(fields, passphrase, { skipEmptyValues: false });

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
