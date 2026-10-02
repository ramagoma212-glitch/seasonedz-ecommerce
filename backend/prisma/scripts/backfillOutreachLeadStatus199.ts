// Milestone 199, Part 2: the one-time historical backfill for the new
// OutreachContact.leadStatus field. Every contact defaults to PROSPECT
// from the migration itself — this script upgrades the ones with
// reliable evidence of genuine business contact to CONTACTED, and sets
// their lastContactedAt to the real date that happened.
//
// The actual decision logic (which campaigns count as "real" business
// contact vs. the owner's own test/placeholder campaign, and which
// contact gets which lastContactedAt) lives in
// src/services/outreach/outreachLeadStatusBackfill.service.ts, fully
// unit tested there — this script is only the DB-touching runner.
//
// Idempotent and safe to re-run: never downgrades a contact an admin
// has already manually progressed past CONTACTED (see main()'s own
// guard below).
//
// Already applied once to production during the Milestone 199
// investigation (50 of 52 contacts became CONTACTED; the 2 excluded
// were the owner's own personal test addresses, nedzamb1a@gmail.com
// and ramagoma212@gmail.com, which only ever appear on the original
// placeholder campaign). Kept here, reviewable and re-runnable, rather
// than left as a throwaway script — same "never leave the real
// migration logic only in scratch/ scrollback" discipline this
// project's own workflow follows.

import { PrismaClient } from "@prisma/client";
import { computeContactedBackfill, type BackfillSentRecipient } from "../../src/services/outreach/outreachLeadStatusBackfill.service.js";

const prisma = new PrismaClient();

async function main() {
  const campaigns = await prisma.outreachCampaign.findMany({ select: { id: true, name: true } });
  const sentRecipients = await prisma.outreachCampaignRecipient.findMany({
    where: { status: "SENT" },
    select: { contactId: true, campaignId: true, sentAt: true },
  });
  // sentAt is only ever null for a row that isn't actually SENT — the
  // where clause above already guarantees every row here has one, but
  // the type is nullable on the model, so this filter satisfies
  // TypeScript without weakening the actual guarantee.
  const backfill = computeContactedBackfill(
    campaigns,
    sentRecipients.filter((r): r is BackfillSentRecipient => r.sentAt !== null)
  );

  let contactedCount = 0;
  let skippedAlreadyProgressed = 0;
  for (const [contactId, latestSentAt] of backfill) {
    const contact = await prisma.outreachContact.findUnique({ where: { id: contactId }, select: { leadStatus: true } });
    if (!contact) continue;
    // Never downgrade a contact an admin has already manually moved
    // past CONTACTED — safe to re-run without undoing real CRM work.
    if (contact.leadStatus !== "PROSPECT" && contact.leadStatus !== "CONTACTED") {
      skippedAlreadyProgressed++;
      continue;
    }
    await prisma.outreachContact.update({
      where: { id: contactId },
      data: { leadStatus: "CONTACTED", lastContactedAt: latestSentAt },
    });
    contactedCount++;
  }

  const totalContacts = await prisma.outreachContact.count();
  console.log(`Contacts set to CONTACTED (or lastContactedAt refreshed): ${contactedCount}`);
  console.log(`Contacts skipped (already manually progressed past CONTACTED): ${skippedAlreadyProgressed}`);
  console.log(`Total contacts: ${totalContacts}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
