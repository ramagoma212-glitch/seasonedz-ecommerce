// Milestone 199, Part 2: the pure decision logic behind the one-time
// historical leadStatus backfill — kept here (src/services) rather
// than inside prisma/scripts/backfillOutreachLeadStatus199.ts itself
// so it's covered by the ordinary `npm test` run, the same "pure
// function, no DB, fully tested" discipline order.validator.ts/
// preorder.service.ts already use. The actual DB-touching script
// imports these two functions rather than duplicating the logic.
//
// "Reliable evidence" of genuine business contact is deliberately
// narrow: a SENT OutreachCampaignRecipient row belonging to a REAL
// business campaign — never the owner's own test/placeholder campaign
// (identified by its own name NOT starting with "Seasonedz", the
// naming convention every real Milestone 198 campaign uses). This
// never infers INTERESTED/CATALOGUE_SENT/QUOTE_REQUESTED/NEGOTIATING/
// CUSTOMER/REPEAT_CUSTOMER from sending history — those require
// genuine business progress an admin sets manually.

export function isPlaceholderCampaignName(name: string): boolean {
  return !name.startsWith("Seasonedz");
}

export interface BackfillCampaign {
  id: string;
  name: string;
}

export interface BackfillSentRecipient {
  contactId: string;
  campaignId: string;
  sentAt: Date;
}

// Pure, DB-free: given every campaign and every SENT recipient row,
// returns the contactId -> latest genuine-contact date map the
// backfill should apply. A recipient row belonging to a placeholder
// campaign is excluded entirely, even if that same contact has no
// other SENT row — it simply never appears in the returned map, which
// is exactly "stays PROSPECT."
export function computeContactedBackfill(campaigns: BackfillCampaign[], sentRecipients: BackfillSentRecipient[]): Map<string, Date> {
  const realCampaignIds = new Set(campaigns.filter((c) => !isPlaceholderCampaignName(c.name)).map((c) => c.id));

  const latestByContact = new Map<string, Date>();
  for (const recipient of sentRecipients) {
    if (!realCampaignIds.has(recipient.campaignId)) continue;
    const existing = latestByContact.get(recipient.contactId);
    if (!existing || recipient.sentAt > existing) {
      latestByContact.set(recipient.contactId, recipient.sentAt);
    }
  }
  return latestByContact;
}
