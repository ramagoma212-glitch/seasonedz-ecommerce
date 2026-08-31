// Milestone 179, Part C: admin email OTP two-factor authentication.
// Created only after email+password has already succeeded — see
// adminAuth.service.ts's loginWithPassword(). Nothing here ever
// creates an AdminSession; that only happens once verifyOtp() below
// returns success (brief section 8's own "do NOT create the
// authenticated admin session before OTP succeeds").

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "../config/prisma.js";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes (brief section 12)
const MAX_ATTEMPTS = 5; // brief section 14
const RESEND_COOLDOWN_MS = 60 * 1000; // brief section 15

export class AdminOtpError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminOtpError";
    this.statusCode = statusCode;
  }
}

function hashValue(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// 6 numeric digits, cryptographically random (brief section 10) — never
// Math.random(), never a sequential/predictable generator. randomInt is
// Node's own CSPRNG-backed uniform integer generator, zero-padded so a
// code can legitimately start with 0 (e.g. "042817") without becoming
// a 5-digit number.
function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export interface IssuedOtpChallenge {
  challengeId: string;
  // The opaque, high-entropy reference the frontend must hold and
  // resubmit with the code — see the schema's own comment on why this
  // is a second secret, independent of the 6-digit code itself.
  rawChallengeToken: string;
  code: string;
  expiresAt: Date;
}

// Invalidates any still-active challenge for this admin first (brief
// section 15: "invalidate older active OTPs... where appropriate" — a
// login can only ever be waiting on one current code at a time), then
// issues a fresh one. Never returns the code hashed or logs it — the
// caller (adminAuth.controller.ts) must send it by email immediately
// and never persist or log the plaintext value itself.
export async function issueOtpChallenge(adminUserId: string): Promise<IssuedOtpChallenge> {
  const code = generateOtpCode();
  const rawChallengeToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  const challenge = await prisma.$transaction(async (tx) => {
    await tx.adminOtpChallenge.updateMany({
      where: { adminUserId, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() }, // immediately expire, never delete — keeps the audit trail
    });

    return tx.adminOtpChallenge.create({
      data: {
        adminUserId,
        challengeTokenHash: hashValue(rawChallengeToken),
        codeHash: hashValue(code),
        expiresAt,
      },
    });
  });

  return { challengeId: challenge.id, rawChallengeToken, code, expiresAt };
}

// Brief section 15: a resend cooldown of at least 60 seconds since the
// most recent challenge issued for this admin (regardless of whether
// that one is now used/expired/superseded — the cooldown is about
// email-sending rate, not challenge validity). Returns the number of
// seconds still remaining, or null if a resend is allowed now.
export async function secondsUntilOtpResendAllowed(adminUserId: string): Promise<number | null> {
  const mostRecent = await prisma.adminOtpChallenge.findFirst({
    where: { adminUserId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (!mostRecent) return null;

  const elapsedMs = Date.now() - mostRecent.createdAt.getTime();
  if (elapsedMs >= RESEND_COOLDOWN_MS) return null;
  return Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 1000);
}

// Looks up the challenge by hashing the incoming raw reference (never
// by any other field) — a request that doesn't hold the exact
// challenge reference this admin's own login response returned can
// never reach the code-comparison step at all. Every failure path
// (unknown/expired/used challenge, wrong code, attempt limit reached)
// throws the same AdminOtpError shape the controller turns into one
// generic-enough message, but with enough distinct detail server-side
// for the security event log — see adminAuth.controller.ts.
export async function verifyOtpChallenge(rawChallengeToken: string, code: string): Promise<{ adminUserId: string }> {
  const challenge = await prisma.adminOtpChallenge.findUnique({
    where: { challengeTokenHash: hashValue(rawChallengeToken) },
  });

  if (!challenge) throw new AdminOtpError("This verification code has expired. Please sign in again.", 400);
  if (challenge.usedAt) throw new AdminOtpError("This verification code has already been used. Please sign in again.", 400);
  if (challenge.expiresAt.getTime() < Date.now()) throw new AdminOtpError("This verification code has expired. Please sign in again.", 400);
  if (challenge.attemptCount >= MAX_ATTEMPTS) throw new AdminOtpError("Too many incorrect attempts. Please sign in again.", 429);

  const providedHash = hashValue(code);
  const expectedBuffer = Buffer.from(challenge.codeHash, "hex");
  const providedBuffer = Buffer.from(providedHash, "hex");
  const codeMatches = expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);

  if (!codeMatches) {
    const updated = await prisma.adminOtpChallenge.update({
      where: { id: challenge.id },
      data: { attemptCount: { increment: 1 } },
    });
    const remaining = MAX_ATTEMPTS - updated.attemptCount;
    if (remaining <= 0) {
      throw new AdminOtpError("Too many incorrect attempts. Please sign in again.", 429);
    }
    throw new AdminOtpError("Incorrect verification code.", 400);
  }

  // Single use (brief section 13): marked atomically the moment it
  // succeeds — a second verify attempt with the same challenge token
  // and code, even a genuine replay, hits the usedAt check above and
  // fails.
  await prisma.adminOtpChallenge.update({ where: { id: challenge.id }, data: { usedAt: new Date() } });

  return { adminUserId: challenge.adminUserId };
}

// Resend support: resolves a raw challenge token back to the admin it
// belongs to, without consuming an attempt or requiring a code — a
// resend is about issuing a brand new challenge for the same pending
// login, not about checking the old one. Returns null for any
// unrecognised token (the controller then treats the login attempt as
// expired, same as any other unknown-token case).
export async function findAdminIdForChallengeToken(rawChallengeToken: string): Promise<string | null> {
  const challenge = await prisma.adminOtpChallenge.findUnique({
    where: { challengeTokenHash: hashValue(rawChallengeToken) },
    select: { adminUserId: true },
  });
  return challenge?.adminUserId ?? null;
}

// Exposed for the login controller to build a masked-email display
// string without ever sending the full address back to the browser
// unnecessarily (brief section 9: "do not unnecessarily reveal the
// full email address").
export function maskEmailForDisplay(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(local.length - 1, 2))}@${domain}`;
}
