// Milestone 179, Part B: reissue an admin invitation by email. Issues
// a fresh token that immediately invalidates any previous one for the
// same account (see adminInvitation.service.ts's own
// reissueAdminInvitation() comment), and sends a new activation email.
// Only applies to accounts not yet activated. Never creates, stores,
// or emails a password.
//
// Must be invoked deliberately, with real values supplied only as
// inline environment variables (never written to any file), e.g.:
//
//   ADMIN_REISSUE_EMAIL=someone@example.com ADMIN_REISSUE_BY_EMAIL=owner@example.com \
//     npx tsx prisma/scripts/reissueAdminInvitationByEmail.ts

import { PrismaClient, UserRole } from "@prisma/client";
import { reissueAdminInvitation } from "../../src/services/adminInvitation.service.js";
import { sendAdminInvitationEmail } from "../../src/services/email/email.service.js";
import { preferredFrontendBaseUrl } from "../../src/utils/frontendUrl.js";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_REISSUE_EMAIL?.trim().toLowerCase();
  const invitedByEmail = process.env.ADMIN_REISSUE_BY_EMAIL?.trim().toLowerCase();

  if (!email || !invitedByEmail) {
    console.error("ADMIN_REISSUE_EMAIL and ADMIN_REISSUE_BY_EMAIL are required. Aborting.");
    process.exitCode = 1;
    return;
  }

  const target = await prisma.adminUser.findUnique({ where: { email } });
  if (!target) {
    console.error("ADMIN_REISSUE_EMAIL did not match an existing admin account. Aborting.");
    process.exitCode = 1;
    return;
  }

  const inviter = await prisma.adminUser.findUnique({ where: { email: invitedByEmail } });
  if (!inviter || inviter.role !== UserRole.ADMIN || !inviter.isActive) {
    console.error("ADMIN_REISSUE_BY_EMAIL did not match an existing active ADMIN account. Aborting.");
    process.exitCode = 1;
    return;
  }

  const invitation = await reissueAdminInvitation(target.id, inviter.id);

  const activationUrl = `${preferredFrontendBaseUrl()}/admin/activate?token=${invitation.rawToken}`;
  const emailSent = await sendAdminInvitationEmail({
    inviteeName: invitation.admin.name,
    inviteeEmail: invitation.admin.email,
    activationUrl,
    role: invitation.admin.role,
    inviterName: inviter.name,
  });

  // Confirms success without ever printing the raw activation token.
  console.log("REISSUE_OK");
  console.log("email:", invitation.admin.email);
  console.log("role:", invitation.admin.role);
  console.log("emailSent:", emailSent);
  console.log("expiresAt:", invitation.expiresAt.toISOString());
}

main()
  .catch((error) => {
    console.error("Admin invitation reissue failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
