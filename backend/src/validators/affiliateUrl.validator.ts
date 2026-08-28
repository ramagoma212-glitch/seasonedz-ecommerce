// Version 7, Milestone 172B: dedicated validator for AffiliateProduct's
// affiliateUrl field — this is the one value that, if wrong, could
// point a visitor's browser somewhere dangerous, so it gets its own
// file and its own focused tests, the same "security-critical value
// deserves a single-purpose validator" discipline already used for
// payfastSignature.ts/payfastServerValidation.ts.
//
// Nothing here builds a public redirect — that's Milestone 172C's own
// /go/:trackingSlug route. This only decides whether an ADMIN-supplied
// URL is safe to store at all. A site visitor never reaches this
// function: affiliateUrl is only ever written through the admin
// product service, never read from a public request.
//
// A strict merchant-domain allowlist is deliberately NOT implemented
// yet (see the 172A audit and the 172B brief's own "MERCHANT DOMAIN
// ALLOWLIST" decision) — the checks below are the generic, owner-
// approved safety net that still applies regardless of which merchant
// is eventually added.

const MAX_URL_LENGTH = 2000;

// RFC 1918 / RFC 4193 / loopback / link-local ranges — a URL pointing
// at any of these can never be a genuine public merchant destination.
// Deliberately checked on the parsed hostname string, not by resolving
// DNS (this backend has no reason to make an outbound network call
// just to validate a string an admin typed).
const PRIVATE_IPV4_PATTERNS: RegExp[] = [
  /^127\./, // loopback
  /^10\./, // RFC 1918
  /^172\.(1[6-9]|2\d|3[0-1])\./, // RFC 1918
  /^192\.168\./, // RFC 1918
  /^169\.254\./, // link-local
  /^0\./, // "this network"
];

const RESERVED_HOSTNAMES = new Set(["localhost", "0.0.0.0"]);

function isIpv4Literal(hostname: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function isBracketedIpv6Literal(hostname: string): boolean {
  return hostname.startsWith("[") && hostname.endsWith("]");
}

export interface AffiliateUrlValidationResult {
  isValid: boolean;
  error?: string;
  normalizedUrl?: string;
}

// Pure, synchronous, and side-effect free — easy to unit test directly
// against every rejection case the milestone brief lists.
export function validateAffiliateUrl(raw: unknown): AffiliateUrlValidationResult {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { isValid: false, error: "affiliateUrl is required." };
  }

  const trimmed = raw.trim();
  if (trimmed.length > MAX_URL_LENGTH) {
    return { isValid: false, error: `affiliateUrl must be ${MAX_URL_LENGTH} characters or fewer.` };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { isValid: false, error: "affiliateUrl must be a valid, absolute URL." };
  }

  // Covers javascript:, data:, file:, ftp:, and every other scheme in
  // one check — https is the only value ever accepted, so there is no
  // separate "reject javascript:" branch to individually bypass.
  if (parsed.protocol !== "https:") {
    return { isValid: false, error: "affiliateUrl must start with https://. No other protocol is accepted." };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { isValid: false, error: "affiliateUrl must include a real hostname." };
  }

  if (RESERVED_HOSTNAMES.has(hostname)) {
    return { isValid: false, error: "affiliateUrl cannot point at localhost." };
  }

  if (isBracketedIpv6Literal(hostname)) {
    // No genuine public affiliate program ever links out to a bare
    // IPv6 literal — rejected outright rather than attempting to parse
    // and range-check every private/reserved IPv6 block.
    return { isValid: false, error: "affiliateUrl cannot point directly at an IP address." };
  }

  if (isIpv4Literal(hostname)) {
    if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname))) {
      return { isValid: false, error: "affiliateUrl cannot point at a private or reserved address." };
    }
    // A public IPv4 literal is still not a real merchant domain in
    // practice — rejected for the same reason as the IPv6 case above.
    return { isValid: false, error: "affiliateUrl cannot point directly at an IP address." };
  }

  return { isValid: true, normalizedUrl: parsed.toString() };
}
