// PayFast ITN source verification (Version 4, Milestone 29 —
// hardening, disabled by default via PAYFAST_VERIFY_SOURCE).
//
// PayFast does not publish a small, fixed, static IP allowlist to
// compare a request against (or at least, none is known/verified as
// part of this codebase — asserting a specific IP range without a
// citable source would be guessing, which this deliberately avoids).
// Instead, this resolves PayFast's own domains via DNS at verification
// time and compares the request's source IP against whatever those
// domains currently resolve to — correct even if PayFast's IPs change,
// and never a hardcoded list that could silently go stale.
//
// This is one layer of defense, never the only one — signature,
// amount, and merchant-ID verification (payfast.service.ts) all still
// run regardless of whether this is enabled. See
// backend/VERSION_4_PAYFAST_SOURCE_VERIFICATION.md for the full plan
// this implements, including why this can't be meaningfully tested
// against real traffic from local development.

import type { Request } from "express";
import { resolve4, resolve6 } from "node:dns/promises";

const SANDBOX_ALLOWED_DOMAINS = ["sandbox.payfast.co.za"];

// PayFast's documented production hostnames for custom integrations —
// www.payfast.co.za is the primary one; w1w./w2w. are additional
// production hosts PayFast's own integration guides reference.
const PRODUCTION_ALLOWED_DOMAINS = ["www.payfast.co.za", "w1w.payfast.co.za", "w2w.payfast.co.za"];

// Node's dual-stack sockets sometimes represent an IPv4 client as an
// IPv4-mapped IPv6 address (e.g. "::ffff:102.130.116.4"). DNS
// resolve4() returns plain IPv4 addresses, so without this the two
// would never compare equal even for the same real address.
function normalizeIp(ip: string): string {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped?.[1] ?? ip;
}

// Reads the request's source IP. Correctness depends entirely on
// TRUST_PROXY being configured correctly for the actual deployment
// topology (see app.ts) — Express's req.ip only reflects the real
// original client, rather than a reverse proxy's own address, once
// "trust proxy" is set to trust the right number of hops. This
// deliberately reads only req.ip (which Express itself derives from
// X-Forwarded-For when trust proxy is configured) rather than reading
// the X-Forwarded-For header directly — a client can set that header
// to anything, so trusting it without Express's own proxy-hop
// validation in front of it would defeat the point of this check.
export function getRequestSourceIp(req: Request): string | undefined {
  const ip = req.ip;
  return ip ? normalizeIp(ip) : undefined;
}

async function resolveDomainIps(domain: string): Promise<string[]> {
  const [v4, v6] = await Promise.all([
    resolve4(domain).catch(() => [] as string[]),
    resolve6(domain).catch(() => [] as string[]),
  ]);
  return [...v4, ...v6];
}

// Verifies that `req`'s source IP resolves back to one of PayFast's
// own domains for the given mode. Returns false — never throws, never
// "passes" — for any case that can't be positively confirmed: no
// source IP available, DNS resolution failing for every allowed
// domain, or the IP simply not matching. The caller
// (payfast.service.ts) must treat false as a hard rejection, not a
// warning.
export async function verifyPayfastSource(req: Request, mode: "sandbox" | "production"): Promise<boolean> {
  const sourceIp = getRequestSourceIp(req);
  if (!sourceIp) return false;

  const allowedDomains = mode === "production" ? PRODUCTION_ALLOWED_DOMAINS : SANDBOX_ALLOWED_DOMAINS;

  for (const domain of allowedDomains) {
    const ips = await resolveDomainIps(domain);
    if (ips.includes(sourceIp)) return true;
  }

  return false;
}
