// Version 7, Milestone 58: manual admin bootstrap script.
//
// Creates or updates exactly one AdminUser. Never run automatically —
// not part of `npm run build`, `postinstall`, or any deploy step.
// Must be invoked deliberately, with real values supplied only as
// inline environment variables (never written to any file), e.g.:
//
//   ADMIN_SETUP_EMAIL=someone@example.com ADMIN_SETUP_PASSWORD='a-real-strong-password' \
//     npx tsx prisma/scripts/setupAdminUser.ts
//
// This script was written but deliberately NOT run with real values
// during Milestone 58 — see VERSION_7_ADMIN_AUTH_FOUNDATION_RESULT.md.
// It also cannot succeed against the shared database until the
// `add_admin_auth` migration (prepared, not yet applied) is deployed —
// that is an intentional, separate approval step.

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../../src/services/adminAuth.service.js";

const prisma = new PrismaClient();

const MIN_PASSWORD_LENGTH = 12;

function isPasswordStrongEnough(password: string): boolean {
  if (password.length < MIN_PASSWORD_LENGTH) return false;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  return hasLetter && hasNumber;
}

async function main() {
  const email = process.env.ADMIN_SETUP_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SETUP_PASSWORD;
  const name = process.env.ADMIN_SETUP_NAME?.trim() || "Admin";

  if (!email) {
    console.error("ADMIN_SETUP_EMAIL is required (inline env var only — never hardcode it). Aborting.");
    process.exitCode = 1;
    return;
  }

  if (!password) {
    console.error("ADMIN_SETUP_PASSWORD is required (inline env var only — never hardcode it). Aborting.");
    process.exitCode = 1;
    return;
  }

  if (!isPasswordStrongEnough(password)) {
    // Deliberately never logs the password itself, only the reason it
    // was rejected.
    console.error(
      `ADMIN_SETUP_PASSWORD is too weak — it must be at least ${MIN_PASSWORD_LENGTH} characters and include ` +
        "at least one letter and one number. Aborting. No admin user was created or changed."
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { name, passwordHash, isActive: true },
    create: { email, name, passwordHash, role: "ADMIN", isActive: true },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  // Confirms success without ever printing the password or its hash.
  console.log(`Admin user ready: email="${admin.email}" role="${admin.role}" isActive=${admin.isActive}`);
}

main()
  .catch((error) => {
    console.error("Admin bootstrap failed:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
