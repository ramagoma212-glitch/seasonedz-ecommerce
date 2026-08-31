// Milestone 179, Part B: admin invitation script. Creates an AdminUser
// (passwordHash null, isActive false) plus a one-time activation
// invitation, and sends the activation email via the existing
// Brevo/console infrastructure — mirrors exactly what
// adminUsers.controller.ts's inviteAdminUserHandler does over HTTP,
// for use when invoking that authenticated endpoint isn't practical
// (e.g. a directly owner-authorised, script-driven invite). Never
// creates, stores, or emails a password.
//
// Must be invoked deliberately, with real values supplied only as
// inline environment variables (never written to any file), e.g.:
//
//   ADMIN_INVITE_EMAIL=someone@example.com ADMIN_INVITE_NAME="Someone Name" \
//   ADMIN_INVITE_ROLE=STAFF ADMIN_INVITE_BY_EMAIL=owner@example.com \
//     npx tsx prisma/scripts/inviteAdminUser.ts

import { PrismaClient, UserRole } from "@prisma/client";
import { createAdminInvitation } from "../../src/services/adminInvitation.service.js";
import { sendAdminInvitationEmail } from "../../src/services/email/email.service.js";
import { recordAdminSecurityEvent } from "../../src/services/adminSecurityEvent.service.js";
import { preferredFrontendBaseUrl } from "../../src/utils/frontendUrl.js";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_INVITE_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_INVITE_NAME?.trim();
  const roleInput = (process.env.ADMIN_INVITE_ROLE || "STAFF").trim().toUpperCase();
  const invitedByEmail = process.env.ADMIN_INVITE_BY_EMAIL?.trim().toLowerCase();

  if (!email || !name) {
    console.error("ADMIN_INVITE_EMAIL and ADMIN_INVITE_NAME are required. Aborting. No admin user was created.");
    process.exitCode = 1;
    return;
  }
  if (!invitedByEmail) {
    console.error("ADMIN_INVITE_BY_EMAIL is required (must match an existing active ADMIN account). Aborting.");
    process.exitCode = 1;
    return;
  }

  // Milestone 179, brief section 2: STAFF is the default and the only
  // way to get ADMIN via this script is an explicit, correctly-spelled
  // ADMIN_INVITE_ROLE=ADMIN — any other/unrecognised value silently
  // falls back to STAFF, never up to ADMIN.
  const role = roleInput === "ADMIN" ? UserRole.ADMIN : UserRole.STAFF;

  const inviter = await prisma.adminUser.findUnique({ where: { email: invitedByEmail } });
  if (!inviter || inviter.role !== UserRole.ADMIN || !inviter.isActive) {
    console.error("ADMIN_INVITE_BY_EMAIL did not match an existing active ADMIN account. Aborting. No admin user was created.");
    process.exitCode = 1;
    return;
  }

  const invitation = await createAdminInvitation({ name, email, role }, inviter.id);

  const activationUrl = `${preferredFrontendBaseUrl()}/admin/activate?token=${invitation.rawToken}`;
  const emailSent = await sendAdminInvitationEmail({
    inviteeName: invitation.admin.name,
    inviteeEmail: invitation.admin.email,
    activationUrl,
    role: invitation.admin.role,
    inviterName: inviter.name,
  });

  await recordAdminSecurityEvent({
    adminUserId: invitation.admin.id,
    eventType: "ADMIN_ACCOUNT_CREATED",
    summary: `Invited as ${role} via script by ${inviter.id}`,
  });

  // Confirms success without ever printing the raw activation token.
  console.log("INVITE_OK");
  console.log("email:", invitation.admin.email);
  console.log("role:", invitation.admin.role);
  console.log("emailSent:", emailSent);
  console.log("expiresAt:", invitation.expiresAt.toISOString());
  console.log("isActive:", false);
}

main()
  .catch((error) => {
    console.error("Admin invitation failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
