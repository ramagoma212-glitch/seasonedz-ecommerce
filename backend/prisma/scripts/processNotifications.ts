// Version 7, Milestone 174B: notification recovery/retry processor —
// invoked as `npm run notifications:process`. See
// notificationProcessor.service.ts for the full design and
// DELIVERY_SETUP.md/NOTIFICATIONS_SETUP.md for the recommended external
// schedule (this script is never invoked automatically by anything in
// this codebase).
//
// Exit behaviour (brief section 45): exits 0 whenever the run itself
// completed, whether or not every individual notification it looked at
// ended up SENT — an unreachable Brevo or an invalid recipient is an
// expected, already-logged outcome for one row, not a processor
// failure. Exits non-zero only for a genuine processor-level error
// (e.g. the database itself is unreachable), via the .catch() below.

import { prisma } from "../../src/config/prisma.js";
import { processDueNotifications } from "../../src/services/notificationProcessor.service.js";

async function main() {
  const result = await processDueNotifications();
  console.log(`[notifications:process] candidates=${result.candidateCount} sent=${result.sent} stillFailed=${result.stillFailed}`);
}

main()
  .catch((error) => {
    console.error("[notifications:process] processor-level failure:", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
