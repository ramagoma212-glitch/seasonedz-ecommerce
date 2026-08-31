// Milestone 179, Part G: ADMIN-only admin-user management. Every route
// this controller serves is mounted behind requireAdminRole(ADMIN) at
// the router level (adminUsers.routes.ts) — unlike Content Studio's
// "STAFF read, ADMIN write" split, the brief calls this out as an
// "ADMIN-only management area" as a whole, since the list itself (who
// else holds admin access) is exactly the kind of visibility Part H
// says STAFF must not gain from this milestone.

import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@prisma/client";
import { sendError, sendSuccess } from "../utils/apiResponse.js";
import { asRecord, isNonEmptyString } from "../validators/shared.js";
import { changeAdminUserRole, listAdminUsers, setAdminUserActive, AdminUsersError } from "../services/adminUsers.service.js";
import { createAdminInvitation, reissueAdminInvitation, AdminInvitationError } from "../services/adminInvitation.service.js";
import { sendAdminInvitationEmail } from "../services/email/email.service.js";
import { recordAdminSecurityEvent } from "../services/adminSecurityEvent.service.js";
import { preferredFrontendBaseUrl } from "../utils/frontendUrl.js";

function requestMeta(req: Request): { ipAddress: string | undefined; userAgent: string | undefined } {
  return { ipAddress: req.ip, userAgent: req.get("user-agent") };
}

function invitationActivationUrl(rawToken: string): string {
  return `${preferredFrontendBaseUrl()}/admin/activate?token=${rawToken}`;
}

export async function listAdminUsersHandler(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const admins = await listAdminUsers();
    sendSuccess(res, { message: "Admin users retrieved successfully.", data: { admins } });
  } catch (error) {
    next(error);
  }
}

// Brief Part B/G: only ADMIN may create a new AdminUser (enforced by
// this route's own requireAdminRole gate, not here) — creates the
// account plus its invitation, records ADMIN_ACCOUNT_CREATED, and sends
// the activation email. Never accepts or generates a password here.
export async function inviteAdminUserHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const actingAdmin = req.adminUser;
    const { name, email, role } = asRecord(req.body);
    const { ipAddress, userAgent } = requestMeta(req);

    if (!isNonEmptyString(name) || !isNonEmptyString(email)) {
      sendError(res, { message: "Name and email are required.", statusCode: 400 });
      return;
    }
    const requestedRole = role === UserRole.ADMIN ? UserRole.ADMIN : UserRole.STAFF;

    const invitation = await createAdminInvitation({ name, email, role: requestedRole }, actingAdmin.id);

    void recordAdminSecurityEvent({
      adminUserId: invitation.admin.id,
      eventType: "ADMIN_ACCOUNT_CREATED",
      summary: `Invited as ${requestedRole} by ${actingAdmin.id}`,
      ipAddress,
      userAgent,
    });
    void sendAdminInvitationEmail({
      inviteeName: invitation.admin.name,
      inviteeEmail: invitation.admin.email,
      activationUrl: invitationActivationUrl(invitation.rawToken),
      role: invitation.admin.role,
      inviterName: actingAdmin.name,
    }).catch(() => {});

    sendSuccess(res, { message: "Invitation sent.", data: { admin: invitation.admin, expiresAt: invitation.expiresAt }, statusCode: 201 });
  } catch (error) {
    if (error instanceof AdminInvitationError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

export async function reissueInvitationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const actingAdmin = req.adminUser;
    const targetId = req.params.id as string;
    const invitation = await reissueAdminInvitation(targetId, actingAdmin.id);

    void sendAdminInvitationEmail({
      inviteeName: invitation.admin.name,
      inviteeEmail: invitation.admin.email,
      activationUrl: invitationActivationUrl(invitation.rawToken),
      role: invitation.admin.role,
      inviterName: actingAdmin.name,
    }).catch(() => {});

    sendSuccess(res, { message: "Invitation resent.", data: { admin: invitation.admin, expiresAt: invitation.expiresAt } });
  } catch (error) {
    if (error instanceof AdminInvitationError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

// Brief Part G/H: only ADMIN may change roles (route-level gate);
// adminUsers.service.ts itself refuses any change that would leave
// zero active ADMIN accounts.
export async function changeAdminUserRoleHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const actingAdmin = req.adminUser;
    const targetId = req.params.id as string;
    const { role } = asRecord(req.body);
    const { ipAddress, userAgent } = requestMeta(req);

    if (role !== UserRole.ADMIN && role !== UserRole.STAFF) {
      sendError(res, { message: "Role must be ADMIN or STAFF.", statusCode: 400 });
      return;
    }

    const updated = await changeAdminUserRole(targetId, role);
    void recordAdminSecurityEvent({
      adminUserId: targetId,
      eventType: "ADMIN_ROLE_CHANGED",
      summary: `Changed to ${role} by ${actingAdmin.id}`,
      ipAddress,
      userAgent,
    });

    sendSuccess(res, { message: "Role updated.", data: { admin: updated } });
  } catch (error) {
    if (error instanceof AdminUsersError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}

// Brief Part G: deactivation immediately blocks login and revokes
// existing sessions (enforced inside adminUsers.service.ts's own
// setAdminUserActive); reactivation is the same action in reverse and
// carries no lockout risk, so it needs no guard.
export async function setAdminUserActiveHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.adminUser) {
      sendError(res, { message: "Authentication required.", statusCode: 401 });
      return;
    }
    const actingAdmin = req.adminUser;
    const targetId = req.params.id as string;
    const { isActive } = asRecord(req.body);
    const { ipAddress, userAgent } = requestMeta(req);

    if (typeof isActive !== "boolean") {
      sendError(res, { message: "isActive must be true or false.", statusCode: 400 });
      return;
    }

    const updated = await setAdminUserActive(targetId, isActive);
    void recordAdminSecurityEvent({
      adminUserId: targetId,
      eventType: isActive ? "ADMIN_ACCOUNT_ACTIVATED" : "ADMIN_ACCOUNT_DEACTIVATED",
      summary: `${isActive ? "Activated" : "Deactivated"} by ${actingAdmin.id}`,
      ipAddress,
      userAgent,
    });
    if (!isActive) {
      void recordAdminSecurityEvent({ adminUserId: targetId, eventType: "ADMIN_SESSIONS_REVOKED", summary: "All sessions revoked (deactivated)", ipAddress, userAgent });
    }

    sendSuccess(res, { message: isActive ? "Account activated." : "Account deactivated.", data: { admin: updated } });
  } catch (error) {
    if (error instanceof AdminUsersError) {
      sendError(res, { message: error.message, statusCode: error.statusCode });
      return;
    }
    next(error);
  }
}
