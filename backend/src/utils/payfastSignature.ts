// PayFast signature generation (Version 3, Milestone 21).
//
// Follows PayFast's "Custom Integration" signature rules:
//  1. Take the fields in the exact order they're going to be
//     submitted to PayFast (insertion order — not alphabetical).
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
// The caller must build the exact same field object (same keys, same
// order, same values) that gets submitted to PayFast as a <form>, or
// the signature PayFast recomputes on its end won't match this one.

import { createHash } from "node:crypto";

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
