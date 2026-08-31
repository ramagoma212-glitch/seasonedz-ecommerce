// Milestone 179, Part G: minimal ADMIN-only admin-user management.
// This file owns an AdminUser row's own mutable account state (role,
// isActive) plus the read/list view — never a password, OTP, reset
// token, invitation token or session token (see AdminUserSummary
// below, and adminInvitation.service.ts for the invitation lifecycle
// itself, which this file does not duplicate).
//
// Role enforcement (only ADMIN may call any mutating function here) is
// applied at the route level via requireAdminRole(UserRole.ADMIN),
// same as every other ADMIN-only action in this codebase (Content
// Studio, Affiliate Products) — this service itself has no concept of
// "who is calling," only "is this change safe to make."

import { UserRole } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { revokeAllSessions } from "./adminAuth.service.js";

export class AdminUsersError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "AdminUsersError";
    this.statusCode = statusCode;
  }
}

export interface AdminUserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  // Lets the admin-users page offer "Resend Invitation" only where it
  // actually applies, without exposing the token or expiry itself.
  invitationPending: boolean;
}

async function toSummary(admin: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  invitation: { usedAt: Date | null } | null;
}): Promise<AdminUserSummary> {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    lastLoginAt: admin.lastLoginAt,
    createdAt: admin.createdAt,
    invitationPending: !admin.isActive && admin.invitation !== null && admin.invitation.usedAt === null,
  };
}

export async function listAdminUsers(): Promise<AdminUserSummary[]> {
  const admins = await prisma.adminUser.findMany({
    orderBy: { createdAt: "asc" },
    include: { invitation: { select: { usedAt: true } } },
  });
  return Promise.all(admins.map(toSummary));
}

// Brief Part G/H: "no self-demotion of the final ADMIN, no deletion/
// deactivation of the final active ADMIN." One shared, role-and-actor-
// agnostic guard covers both — it simply refuses any change that would
// leave zero active ADMIN accounts, regardless of who is making the
// change or which specific action (role change vs deactivation)
// triggers it. There is no hard-delete action anywhere in this system
// (Active/Inactive is the only lifecycle-ending state), so "deletion"
// of the final ADMIN is already impossible by omission.
async function assertLeavesAnActiveAdmin(targetAdminUserId: string): Promise<void> {
  const otherActiveAdmins = await prisma.adminUser.count({
    where: { id: { not: targetAdminUserId }, role: UserRole.ADMIN, isActive: true },
  });
  if (otherActiveAdmins === 0) {
    throw new AdminUsersError("At least one active ADMIN account must remain.", 409);
  }
}

export async function changeAdminUserRole(targetAdminUserId: string, newRole: UserRole): Promise<AdminUserSummary> {
  const admin = await prisma.adminUser.findUnique({ where: { id: targetAdminUserId }, include: { invitation: { select: { usedAt: true } } } });
  if (!admin) throw new AdminUsersError("Admin account not found.", 404);

  if (admin.role === UserRole.ADMIN && admin.isActive && newRole !== UserRole.ADMIN) {
    await assertLeavesAnActiveAdmin(targetAdminUserId);
  }

  const updated = await prisma.adminUser.update({ where: { id: targetAdminUserId }, data: { role: newRole }, include: { invitation: { select: { usedAt: true } } } });
  return toSummary(updated);
}

// Deactivation immediately blocks login (verifyPassword and
// validateSession both already check isActive — adminAuth.service.ts)
// and revokes every existing session in the same action (brief Part
// G's "deactivation must immediately block login and revoke existing
// sessions"), so a deactivated admin's already-open browser tab is cut
// off on its very next request, not just on its next login attempt.
export async function setAdminUserActive(targetAdminUserId: string, isActive: boolean): Promise<AdminUserSummary> {
  const admin = await prisma.adminUser.findUnique({ where: { id: targetAdminUserId }, include: { invitation: { select: { usedAt: true } } } });
  if (!admin) throw new AdminUsersError("Admin account not found.", 404);

  if (!isActive && admin.role === UserRole.ADMIN && admin.isActive) {
    await assertLeavesAnActiveAdmin(targetAdminUserId);
  }

  const updated = await prisma.adminUser.update({ where: { id: targetAdminUserId }, data: { isActive }, include: { invitation: { select: { usedAt: true } } } });

  if (!isActive) {
    await revokeAllSessions(targetAdminUserId);
  }

  return toSummary(updated);
}
