// Milestone 179, Part B: secure admin account onboarding. An ADMIN
// creates a new AdminUser row (name/email/role — passwordHash null,
// isActive false) and an AdminInvitation alongside it, in one
// transaction. The invitee opens their own activation link and sets
// their own password — this backend never emails a permanent password,
// never stores one in plaintext, and never hardcodes one anywhere (see
// this file's own header comment on why AdminUser.passwordHash is
// nullable now).

import { createHash, randomBytes } from "node:crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { hashPassword, validateAdminPasswordStrength, type SafeAdminProfile } from "./adminAuth.service.js";

const INVITATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (brief section 6)

export class AdminInvitationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminInvitationError";
    this.statusCode = statusCode;
  }
}

function hashValue(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function toSafeProfile(admin: { id: string; name: string; email: string; role: UserRole }): SafeAdminProfile {
  return { id: admin.id, name: admin.name, email: admin.email, role: admin.role };
}

export interface CreateInvitationInput {
  name: string;
  email: string;
  role: UserRole;
}

export interface CreatedInvitation {
  admin: SafeAdminProfile;
  rawToken: string;
  expiresAt: Date;
}

// Brief section 7: email uniqueness is enforced here, server-side,
// never trusted from the frontend alone — normalised the same
// trim+lowercase way every other email uniqueness check in this
// backend already normalises (AdminUser.email itself, Customer.email,
// Affiliate.email).
export async function createAdminInvitation(input: CreateInvitationInput, invitedByAdminUserId: string): Promise<CreatedInvitation> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name) throw new AdminInvitationError("Name is required.");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AdminInvitationError("A valid email is required.");
  if (input.role !== UserRole.ADMIN && input.role !== UserRole.STAFF) throw new AdminInvitationError("Role must be ADMIN or STAFF.");

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) throw new AdminInvitationError("An admin account with that email already exists.", 409);

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  const { admin } = await prisma.$transaction(async (tx) => {
    const admin = await tx.adminUser.create({
      data: { name, email, role: input.role, passwordHash: null, isActive: false },
    });
    await tx.adminInvitation.create({
      data: { adminUserId: admin.id, tokenHash: hashValue(rawToken), invitedByAdminUserId, expiresAt },
    });
    return { admin };
  });

  return { admin: toSafeProfile(admin), rawToken, expiresAt };
}

export interface InvitationPreview {
  name: string;
  // Masked, matching adminOtp.service.ts's own "don't reveal the full
  // address unnecessarily" discipline — the activation page shows this
  // to confirm "yes, this invitation is for me" without exposing the
  // full address to anyone who merely holds (or guesses at) a link.
  maskedEmail: string;
}

// Read-only lookup for the activation page itself to render a
// confirmation before the invitee sets a password — never reveals
// whether a given raw token is invalid vs expired vs already used
// beyond one generic result, matching this backend's own no-
// enumeration discipline for every other bearer-token lookup.
export async function previewInvitation(rawToken: string): Promise<InvitationPreview> {
  const invitation = await prisma.adminInvitation.findUnique({
    where: { tokenHash: hashValue(rawToken) },
    include: { adminUser: { select: { name: true, email: true } } },
  });

  if (!invitation || invitation.usedAt || invitation.expiresAt.getTime() < Date.now()) {
    throw new AdminInvitationError("This invitation link is invalid or has expired.", 400);
  }

  const [local, domain] = invitation.adminUser.email.split("@");
  const maskedEmail = local && domain ? `${local[0]}${"*".repeat(Math.max(local.length - 1, 2))}@${domain}` : "***";

  return { name: invitation.adminUser.name, maskedEmail };
}

// Activates the account: sets the invitee's own chosen password,
// flips isActive true, and marks the invitation single-use — all in
// one transaction, so a request that fails partway never leaves an
// account active with no password or an invitation consumed with no
// password set.
export async function activateInvitation(rawToken: string, newPassword: string): Promise<SafeAdminProfile> {
  const passwordError = validateAdminPasswordStrength(newPassword);
  if (passwordError) throw new AdminInvitationError(passwordError, 400);

  const invitation = await prisma.adminInvitation.findUnique({
    where: { tokenHash: hashValue(rawToken) },
    include: { adminUser: true },
  });

  if (!invitation || invitation.usedAt || invitation.expiresAt.getTime() < Date.now()) {
    throw new AdminInvitationError("This invitation link is invalid or has expired.", 400);
  }

  if (newPassword.toLowerCase() === invitation.adminUser.email.toLowerCase()) {
    throw new AdminInvitationError("Password must not be the same as your email address.", 400);
  }

  const passwordHash = await hashPassword(newPassword);

  const [updatedAdmin] = await prisma.$transaction([
    prisma.adminUser.update({ where: { id: invitation.adminUserId }, data: { passwordHash, isActive: true } }),
    prisma.adminInvitation.update({ where: { id: invitation.id }, data: { usedAt: new Date() } }),
  ]);

  return toSafeProfile(updatedAdmin);
}

// Brief section 6: "If expired: ADMIN can issue a new invitation."
// Re-invites an existing pending (not-yet-activated) account — never
// an already-active one, and never changes name/role, only issues a
// fresh token/expiry. AdminInvitation.adminUserId is @unique (at most
// one invitation per account, ever), so this replaces the same row's
// tokenHash/expiresAt in place — the old raw token immediately stops
// working, since activateInvitation() always hashes the incoming raw
// token and looks up this exact row by that hash; once overwritten, no
// previously-issued token can ever match it again.
export async function reissueAdminInvitation(adminUserId: string, invitedByAdminUserId: string): Promise<CreatedInvitation> {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminUserId } });
  if (!admin) throw new AdminInvitationError("Admin account not found.", 404);
  if (admin.isActive) throw new AdminInvitationError("This account has already been activated.", 409);

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

  await prisma.adminInvitation.upsert({
    where: { adminUserId },
    create: { adminUserId, tokenHash: hashValue(rawToken), invitedByAdminUserId, expiresAt },
    update: { tokenHash: hashValue(rawToken), invitedByAdminUserId, expiresAt, usedAt: null },
  });

  return { admin: toSafeProfile(admin), rawToken, expiresAt };
}
