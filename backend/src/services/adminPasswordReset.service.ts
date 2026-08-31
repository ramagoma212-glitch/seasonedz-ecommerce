// Milestone 179, Part D: admin forgotten/reset password. Deliberately
// its own service, its own table (AdminPasswordResetToken), and its
// own frontend route — never the customer flow (customerAuth.service.ts's
// requestPasswordReset()/resetPasswordWithToken()) even though the
// shape mirrors it closely. Reusing the customer flow directly would
// let a customer account and an admin account share a reset path, and
// would send an admin down the customer login system on success —
// exactly what the brief's own Part D explicitly forbids.

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { hashPassword, validateAdminPasswordStrength, type SafeAdminProfile } from "./adminAuth.service.js";

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes (brief section 23)

export class AdminPasswordResetError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminPasswordResetError";
    this.statusCode = statusCode;
  }
}

function hashValue(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function toSafeProfile(admin: { id: string; name: string; email: string; role: string }): SafeAdminProfile {
  return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
}

export interface PasswordResetRequestResult {
  admin: SafeAdminProfile;
  rawToken: string;
}

// Returns null for every case that must stay indistinguishable from
// the caller's side — unknown email, inactive account, or an account
// that was invited but never activated (no usable password to reset
// yet; re-inviting is the correct action there, not a password reset)
// — so the controller can send the exact same generic response
// regardless of which case it was, matching customerAuth.service.ts's
// own requestPasswordReset() discipline exactly.
export async function requestAdminPasswordReset(email: string): Promise<PasswordResetRequestResult | null> {
  const admin = await prisma.adminUser.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!admin || !admin.isActive || !admin.passwordHash) return null;

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  // A superseding request invalidates any earlier still-active token
  // for this same admin (brief section 22) — expiring it immediately
  // rather than deleting keeps the row for the audit trail, same
  // discipline as adminOtp.service.ts's own issueOtpChallenge().
  await prisma.$transaction([
    prisma.adminPasswordResetToken.updateMany({
      where: { adminUserId: admin.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    }),
    prisma.adminPasswordResetToken.create({
      data: { adminUserId: admin.id, tokenHash: hashValue(rawToken), expiresAt },
    }),
  ]);

  return { admin: toSafeProfile(admin), rawToken };
}

// On success: hashes the new password, marks the reset token used
// (single use — brief section 28), and destroys every existing
// AdminSession for this admin in the same transaction (brief section
// 27: mandatory full session revocation after a password reset). A
// fresh email+password+OTP login is required afterward — nothing here
// creates a session itself.
export async function resetAdminPasswordWithToken(rawToken: string, newPassword: string): Promise<SafeAdminProfile> {
  const passwordError = validateAdminPasswordStrength(newPassword);
  if (passwordError) throw new AdminPasswordResetError(passwordError, 400);

  const resetToken = await prisma.adminPasswordResetToken.findUnique({
    where: { tokenHash: hashValue(rawToken) },
    include: { adminUser: true },
  });

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt.getTime() < Date.now() || !resetToken.adminUser.isActive) {
    throw new AdminPasswordResetError("This reset link is invalid or has expired.", 400);
  }

  if (newPassword.toLowerCase() === resetToken.adminUser.email.toLowerCase()) {
    throw new AdminPasswordResetError("Password must not be the same as your email address.", 400);
  }

  const passwordHash = await hashPassword(newPassword);

  const [updatedAdmin] = await prisma.$transaction([
    prisma.adminUser.update({ where: { id: resetToken.adminUserId }, data: { passwordHash } }),
    prisma.adminPasswordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    prisma.adminSession.deleteMany({ where: { adminUserId: resetToken.adminUserId } }),
  ]);

  return toSafeProfile(updatedAdmin);
}
