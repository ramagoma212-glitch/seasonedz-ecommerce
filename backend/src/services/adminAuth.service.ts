// Admin authentication service (Version 7, Milestone 58 — foundation
// only). Session-based auth using the AdminUser/AdminSession models —
// see VERSION_7_ADMIN_AUTH_FOUNDATION_RESULT.md for the full design
// rationale (Option A from VERSION_7_ADMIN_DASHBOARD_PLAN.md).
//
// Nothing here is wired to any order/enquiry/product admin data yet —
// this file only ever touches AdminUser and AdminSession.

import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BCRYPT_SALT_ROUNDS = 12;

// Shared cookie name/max-age so the controller (sets it) and
// middleware (reads it) never drift apart.
export const ADMIN_SESSION_COOKIE_NAME = "admin_session";
export const ADMIN_SESSION_COOKIE_MAX_AGE_MS = SESSION_TTL_MS;

export interface SafeAdminProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

// Never returns or logs a password or password hash — only ever this
// narrow, safe shape.
function toSafeProfile(admin: { id: string; name: string; email: string; role: string }): SafeAdminProfile {
  return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
}

// A session token is a high-entropy random value, not a password —
// SHA-256 (not bcrypt) is the correct, standard tool for hashing a
// value that's already uniformly random and never guessable by brute
// force, unlike a human-chosen password. Only the hash is ever stored;
// the raw token exists only in the HttpOnly cookie sent to the browser.
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

// Hashes a plain password with bcrypt for storage — the bootstrap
// script (prisma/scripts/setupAdminUser.ts), invitation activation,
// and password reset all funnel through this one function so the same
// salt rounds are used everywhere. Never call this with a password
// that will be logged or persisted anywhere except the resulting hash.
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, BCRYPT_SALT_ROUNDS);
}

// Milestone 179, brief section 25: 12 characters minimum, no forced
// composition rules (a long passphrase or a password manager's own
// output is exactly what this is meant to welcome) — deliberately
// stricter than the customer policy (MIN_PASSWORD_LENGTH = 8 in
// customerAuth.service.ts), matching the brief's own explicit
// "production grade" emphasis for admin accounts specifically. Callers
// that also know the account's own email additionally reject a
// password equal to it (adminInvitation.service.ts,
// adminPasswordReset.service.ts) — not checked here, since this
// function has no email to compare against.
const ADMIN_MIN_PASSWORD_LENGTH = 12;

// A short, deliberately non-exhaustive list of weak roots — this is a
// courtesy backstop against the most obvious placeholder values, never
// a substitute for length/entropy. Checked as a substring, not an exact
// match: every one of these roots is itself under 12 characters, so
// against the 12-character minimum above an exact-match check could
// never actually fire (e.g. "password123" is only 11 characters, and
// would already be rejected by the length check first) — a substring
// check is what actually catches a 12+ character password that's still
// obviously just a padded placeholder (e.g. "mypassword12",
// "ChangeMe1234!"). Compared case-insensitively.
const WEAK_PASSWORD_ROOTS = ["password", "changeme", "admin123", "letmein", "welcome123"];

export function validateAdminPasswordStrength(plainPassword: string): string | null {
  if (typeof plainPassword !== "string" || plainPassword.length < ADMIN_MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${ADMIN_MIN_PASSWORD_LENGTH} characters.`;
  }
  const lowered = plainPassword.toLowerCase();
  if (WEAK_PASSWORD_ROOTS.some((root) => lowered.includes(root))) {
    return "This password is too common. Please choose a stronger password.";
  }
  return null;
}

// Verifies email+password ONLY — never creates a session, never
// updates lastLoginAt (that only happens once OTP also succeeds, see
// completeAdminLogin() below). Returns the admin's safe profile on
// success, or null on any failure (unknown email, wrong password,
// inactive account, or an invited-but-not-yet-activated account with
// no password set yet) — deliberately the same null result for every
// failure case, so the controller can return one generic "invalid
// email or password" message regardless of which check failed, never
// revealing whether an email exists (brief section 17).
export async function verifyPassword(email: string, plainPassword: string): Promise<SafeAdminProfile | null> {
  const admin = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!admin || !admin.isActive || !admin.passwordHash) return null;

  const passwordMatches = await bcrypt.compare(plainPassword, admin.passwordHash);
  if (!passwordMatches) return null;

  return toSafeProfile(admin);
}

// Called only once OTP has genuinely succeeded (brief section 8/29).
// This is the one place lastLoginAt is ever written — it now
// represents a real, fully-completed login, not merely a correct
// password.
export async function recordCompletedLogin(adminUserId: string): Promise<void> {
  await prisma.adminUser.update({ where: { id: adminUserId }, data: { lastLoginAt: new Date() } });
}

// Brief section 32: "Log Out All Sessions" — revokes every AdminSession
// for the given account. Used both for an admin revoking their own
// sessions and for an ADMIN revoking a STAFF member's sessions (see
// adminUsers.service.ts), and internally whenever an account becomes
// inactive (brief section 39).
export async function revokeAllSessions(adminUserId: string): Promise<number> {
  const result = await prisma.adminSession.deleteMany({ where: { adminUserId } });
  return result.count;
}

// Creates a new session row and returns the raw token — the only time
// the raw token ever exists outside the HttpOnly cookie. The caller
// (the login controller) must not log or persist it anywhere else.
export async function createSession(adminUserId: string): Promise<{ rawToken: string; expiresAt: Date }> {
  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.adminSession.create({
    data: { adminUserId, tokenHash: hashToken(rawToken), expiresAt },
  });

  return { rawToken, expiresAt };
}

// Looks up a session by hashing the incoming raw token and comparing
// against the stored hash — never reads or compares a raw token
// directly. Returns null (never throws) for any invalid/expired/
// inactive-admin case, so the middleware can respond with a uniform
// 401 either way.
export async function validateSession(rawToken: string): Promise<SafeAdminProfile | null> {
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { adminUser: true },
  });

  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;
  if (!session.adminUser.isActive) return null;

  // Best-effort freshness update — never blocks or fails the request
  // if it errors, since it's not required for the auth decision itself.
  prisma.adminSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return toSafeProfile(session.adminUser);
}

// Deletes the session row matching this token, if any — logout is
// idempotent: calling it with an already-invalid/unknown token is not
// an error, it just means there is nothing left to clear.
export async function destroySession(rawToken: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
}
