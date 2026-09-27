// Milestone 198.1, Part 14: multi-select bulk campaign sending —
// preview (eligibility, cross-campaign duplicate detection, recipient
// totals) and execution (sequential per-campaign sending reusing
// sendCampaignBatch() untouched, failure isolation, cross-campaign
// duplicate protection at execution time, a contact unsubscribing
// between confirmation and execution). Same stub()/stubValue() helper
// pair outreachCampaign.service.test.ts already established.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { OutreachCampaignStatus, OutreachContactStatus, OutreachRecipientStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { previewBulkSend, bulkStartCampaigns } from "./outreachCampaign.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function stubValue<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]) {
  const original = obj[key];
  obj[key] = value;
  return { restore: () => { obj[key] = original; } };
}

function withEmailDisabled() {
  return stubValue(env, "emailEnabled", false);
}

function campaignRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Campaign ${id}`,
    subject: "Subject",
    body: "Hello {{organisation_name}}",
    status: OutreachCampaignStatus.READY,
    audienceFilter: null,
    createdByAdminId: null,
    recipientsBuiltAt: new Date(),
    sendStartedAt: null,
    sendCompletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function recipientRow(id: string, campaignId: string, contactId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    campaignId,
    contactId,
    organisationNameSnapshot: `Org ${contactId}`,
    emailSnapshot: `${contactId}@example.com`,
    status: OutreachRecipientStatus.PENDING,
    providerMessageId: null,
    failureReason: null,
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("previewBulkSend: a single READY campaign is reported eligible with its real recipient counts", async () => {
  const findMany = stub(prisma.outreachCampaign, "findMany", async () => [campaignRow("c1")]);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.PENDING, _count: { _all: 3 } }]);
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => [
    { contactId: "contact-1", campaignId: "c1", emailSnapshot: "a@example.com", organisationNameSnapshot: "A" },
    { contactId: "contact-2", campaignId: "c1", emailSnapshot: "b@example.com", organisationNameSnapshot: "B" },
    { contactId: "contact-3", campaignId: "c1", emailSnapshot: "c@example.com", organisationNameSnapshot: "C" },
  ]);

  const preview = await previewBulkSend(["c1"]);
  assert.equal(preview.totalCampaigns, 1);
  assert.equal(preview.eligibleCampaigns, 1);
  assert.equal(preview.campaigns[0]?.eligible, true);
  assert.equal(preview.uniqueEligibleRecipients, 3);
  assert.equal(preview.crossCampaignDuplicates.length, 0);

  findMany.restore();
  groupBy.restore();
  recipientFindMany.restore();
});

test("previewBulkSend: COMPLETED and CANCELLED campaigns are marked ineligible with a real reason, never silently included", async () => {
  const findMany = stub(prisma.outreachCampaign, "findMany", async () => [campaignRow("c1", { status: OutreachCampaignStatus.COMPLETED }), campaignRow("c2", { status: OutreachCampaignStatus.CANCELLED })]);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.SENT, _count: { _all: 2 } }]);
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => []);

  const preview = await previewBulkSend(["c1", "c2"]);
  assert.equal(preview.eligibleCampaigns, 0);
  assert.equal(preview.campaigns.find((c) => c.id === "c1")?.ineligibleReason, "Already fully sent.");
  assert.equal(preview.campaigns.find((c) => c.id === "c2")?.ineligibleReason, "Cancelled.");

  findMany.restore();
  groupBy.restore();
  recipientFindMany.restore();
});

test("previewBulkSend: a contact appearing PENDING in two selected campaigns is flagged as a cross-campaign duplicate", async () => {
  const findMany = stub(prisma.outreachCampaign, "findMany", async () => [campaignRow("c1"), campaignRow("c2")]);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.PENDING, _count: { _all: 1 } }]);
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => [
    { contactId: "contact-shared", campaignId: "c1", emailSnapshot: "shared@example.com", organisationNameSnapshot: "Shared Org" },
    { contactId: "contact-shared", campaignId: "c2", emailSnapshot: "shared@example.com", organisationNameSnapshot: "Shared Org" },
  ]);

  const preview = await previewBulkSend(["c1", "c2"]);
  assert.equal(preview.uniqueEligibleRecipients, 1, "one real contact, even though it appears twice");
  assert.equal(preview.totalPendingRecipients, 2, "two pending rows exist, one per campaign");
  assert.equal(preview.crossCampaignDuplicates.length, 1);
  assert.deepEqual(preview.crossCampaignDuplicates[0]?.campaignIds.sort(), ["c1", "c2"]);

  findMany.restore();
  groupBy.restore();
  recipientFindMany.restore();
});

test("bulkStartCampaigns: processes multiple eligible campaigns sequentially, each through the same real sendCampaignBatch path", async () => {
  const restoreEmail = withEmailDisabled();
  const campaigns = new Map([
    ["c1", campaignRow("c1")],
    ["c2", campaignRow("c2")],
  ]);
  const recipients = new Map([
    ["c1", [recipientRow("r1", "c1", "contact-1")]],
    ["c2", [recipientRow("r2", "c2", "contact-2")]],
  ]);
  const contacts = new Map([
    ["contact-1", { id: "contact-1", email: "a@example.com", contactName: null, organisationName: "A", status: OutreachContactStatus.ACTIVE }],
    ["contact-2", { id: "contact-2", email: "b@example.com", contactName: null, organisationName: "B", status: OutreachContactStatus.ACTIVE }],
  ]);

  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async (args: { where: { id: string } }) => campaigns.get(args.where.id) ?? null);
  const campaignUpdate = stub(prisma.outreachCampaign, "update", async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    const existing = campaigns.get(args.where.id)!;
    const updated = { ...existing, ...args.data };
    campaigns.set(args.where.id, updated);
    return updated;
  });
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async (args: { where: { campaignId: string; status: OutreachRecipientStatus } }) => (recipients.get(args.where.campaignId) ?? []).filter((r) => r.status === args.where.status));
  const recipientUpdate = stub(prisma.outreachCampaignRecipient, "update", async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    for (const list of recipients.values()) {
      const row = list.find((r) => r.id === args.where.id);
      if (row) Object.assign(row, args.data);
    }
    return {};
  });
  const contactFindUnique = stub(prisma.outreachContact, "findUnique", async (args: { where: { id: string } }) => contacts.get(args.where.id) ?? null);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async (args: { where: { campaignId: string } }) => {
    const list = recipients.get(args.where.campaignId) ?? [];
    const counts = new Map<string, number>();
    list.forEach((r) => counts.set(r.status, (counts.get(r.status) ?? 0) + 1));
    return Array.from(counts.entries()).map(([status, count]) => ({ status, _count: { _all: count } }));
  });

  const result = await bulkStartCampaigns(["c1", "c2"]);
  assert.equal(result.totalSent, 2);
  assert.equal(result.campaignsProcessed.length, 2);
  assert.equal(result.campaignsErrored.length, 0);
  assert.equal(result.campaignsSkippedIneligible.length, 0);
  assert.equal(campaigns.get("c1")?.status, OutreachCampaignStatus.COMPLETED);
  assert.equal(campaigns.get("c2")?.status, OutreachCampaignStatus.COMPLETED);

  restoreEmail.restore();
  campaignFindUnique.restore();
  campaignUpdate.restore();
  recipientFindMany.restore();
  recipientUpdate.restore();
  contactFindUnique.restore();
  groupBy.restore();
});

test("bulkStartCampaigns: a COMPLETED campaign in the selection is skipped as ineligible, never re-sent", async () => {
  const restoreEmail = withEmailDisabled();
  const campaigns = new Map([["c1", campaignRow("c1", { status: OutreachCampaignStatus.COMPLETED })]]);
  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async (args: { where: { id: string } }) => campaigns.get(args.where.id) ?? null);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.SENT, _count: { _all: 5 } }]);
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => {
    throw new Error("must never be called — a COMPLETED campaign must never be touched by a bulk send");
  });

  const result = await bulkStartCampaigns(["c1"]);
  assert.equal(result.campaignsProcessed.length, 0);
  assert.equal(result.campaignsSkippedIneligible.length, 1);
  assert.equal(result.campaignsSkippedIneligible[0]?.reason, "Already fully sent.");

  restoreEmail.restore();
  campaignFindUnique.restore();
  groupBy.restore();
  recipientFindMany.restore();
});

test("bulkStartCampaigns: a contact appearing PENDING in two selected campaigns is only ever sent once", async () => {
  const restoreEmail = withEmailDisabled();
  const campaigns = new Map([
    ["c1", campaignRow("c1")],
    ["c2", campaignRow("c2")],
  ]);
  const recipients = new Map([
    ["c1", [recipientRow("r1", "c1", "contact-shared")]],
    ["c2", [recipientRow("r2", "c2", "contact-shared")]],
  ]);
  const contact = { id: "contact-shared", email: "shared@example.com", contactName: null, organisationName: "Shared", status: OutreachContactStatus.ACTIVE };

  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async (args: { where: { id: string } }) => campaigns.get(args.where.id) ?? null);
  const campaignUpdate = stub(prisma.outreachCampaign, "update", async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    const existing = campaigns.get(args.where.id)!;
    const updated = { ...existing, ...args.data };
    campaigns.set(args.where.id, updated);
    return updated;
  });
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async (args: { where: { campaignId: string; status: OutreachRecipientStatus } }) => (recipients.get(args.where.campaignId) ?? []).filter((r) => r.status === args.where.status));
  const recipientUpdate = stub(prisma.outreachCampaignRecipient, "update", async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    for (const list of recipients.values()) {
      const row = list.find((r) => r.id === args.where.id);
      if (row) Object.assign(row, args.data);
    }
    return {};
  });
  const contactFindUnique = stub(prisma.outreachContact, "findUnique", async () => contact);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async (args: { where: { campaignId: string } }) => {
    const list = recipients.get(args.where.campaignId) ?? [];
    const counts = new Map<string, number>();
    list.forEach((r) => counts.set(r.status, (counts.get(r.status) ?? 0) + 1));
    return Array.from(counts.entries()).map(([status, count]) => ({ status, _count: { _all: count } }));
  });

  const result = await bulkStartCampaigns(["c1", "c2"]);
  assert.equal(result.totalSent, 1, "the shared contact is sent to exactly once across the whole bulk run");
  assert.equal(result.totalSkippedCrossCampaignDuplicate, 1);
  // The second campaign's own recipient row for this contact is left
  // exactly PENDING — untouched, not marked SUPPRESSED or FAILED.
  assert.equal(recipients.get("c2")?.[0]?.status, OutreachRecipientStatus.PENDING);

  restoreEmail.restore();
  campaignFindUnique.restore();
  campaignUpdate.restore();
  recipientFindMany.restore();
  recipientUpdate.restore();
  contactFindUnique.restore();
  groupBy.restore();
});

test("bulkStartCampaigns: a contact who unsubscribed after the recipient list was built (but before this bulk execution) is excluded, never sent to", async () => {
  const restoreEmail = withEmailDisabled();
  const campaigns = new Map([["c1", campaignRow("c1")]]);
  const recipients = new Map([["c1", [recipientRow("r1", "c1", "contact-1")]]]);
  // ACTIVE when the recipient list was snapshotted, UNSUBSCRIBED now.
  const contact = { id: "contact-1", email: "a@example.com", contactName: null, organisationName: "A", status: OutreachContactStatus.UNSUBSCRIBED };

  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async (args: { where: { id: string } }) => campaigns.get(args.where.id) ?? null);
  const campaignUpdate = stub(prisma.outreachCampaign, "update", async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    const existing = campaigns.get(args.where.id)!;
    const updated = { ...existing, ...args.data };
    campaigns.set(args.where.id, updated);
    return updated;
  });
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async (args: { where: { campaignId: string; status: OutreachRecipientStatus } }) => (recipients.get(args.where.campaignId) ?? []).filter((r) => r.status === args.where.status));
  const recipientUpdate = stub(prisma.outreachCampaignRecipient, "update", async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    for (const list of recipients.values()) {
      const row = list.find((r) => r.id === args.where.id);
      if (row) Object.assign(row, args.data);
    }
    return {};
  });
  const contactFindUnique = stub(prisma.outreachContact, "findUnique", async () => contact);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async (args: { where: { campaignId: string } }) => {
    const list = recipients.get(args.where.campaignId) ?? [];
    const counts = new Map<string, number>();
    list.forEach((r) => counts.set(r.status, (counts.get(r.status) ?? 0) + 1));
    return Array.from(counts.entries()).map(([status, count]) => ({ status, _count: { _all: count } }));
  });

  const result = await bulkStartCampaigns(["c1"]);
  assert.equal(result.totalSent, 0);
  assert.equal(result.campaignsProcessed[0]?.suppressed, 1);
  assert.equal(recipients.get("c1")?.[0]?.status, OutreachRecipientStatus.SUPPRESSED);

  restoreEmail.restore();
  campaignFindUnique.restore();
  campaignUpdate.restore();
  recipientFindMany.restore();
  recipientUpdate.restore();
  contactFindUnique.restore();
  groupBy.restore();
});

test("bulkStartCampaigns: one campaign throwing (e.g. a genuine concurrent single-campaign send) is isolated — every other selected campaign still gets processed", async () => {
  const restoreEmail = withEmailDisabled();
  const campaigns = new Map([
    ["c1", campaignRow("c1")],
    ["c2", campaignRow("c2")],
  ]);
  const recipients = new Map([
    ["c1", [recipientRow("r1", "c1", "contact-1")]],
    ["c2", [recipientRow("r2", "c2", "contact-2")]],
  ]);
  const contacts = new Map([
    ["contact-1", { id: "contact-1", email: "a@example.com", contactName: null, organisationName: "A", status: OutreachContactStatus.ACTIVE }],
    ["contact-2", { id: "contact-2", email: "b@example.com", contactName: null, organisationName: "B", status: OutreachContactStatus.ACTIVE }],
  ]);

  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async (args: { where: { id: string } }) => campaigns.get(args.where.id) ?? null);
  const campaignUpdate = stub(prisma.outreachCampaign, "update", async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    const existing = campaigns.get(args.where.id)!;
    const updated = { ...existing, ...args.data };
    campaigns.set(args.where.id, updated);
    return updated;
  });
  // c1's own recipient lookup throws (simulating a genuine mid-flight
  // failure specific to that one campaign) — c2 must be entirely
  // unaffected.
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async (args: { where: { campaignId: string; status: OutreachRecipientStatus } }) => {
    if (args.where.campaignId === "c1") throw new Error("simulated transient failure for c1 only");
    return (recipients.get(args.where.campaignId) ?? []).filter((r) => r.status === args.where.status);
  });
  const recipientUpdate = stub(prisma.outreachCampaignRecipient, "update", async (args: { where: { id: string }; data: Record<string, unknown> }) => {
    for (const list of recipients.values()) {
      const row = list.find((r) => r.id === args.where.id);
      if (row) Object.assign(row, args.data);
    }
    return {};
  });
  const contactFindUnique = stub(prisma.outreachContact, "findUnique", async (args: { where: { id: string } }) => contacts.get(args.where.id) ?? null);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async (args: { where: { campaignId: string } }) => {
    const list = recipients.get(args.where.campaignId) ?? [];
    const counts = new Map<string, number>();
    list.forEach((r) => counts.set(r.status, (counts.get(r.status) ?? 0) + 1));
    return Array.from(counts.entries()).map(([status, count]) => ({ status, _count: { _all: count } }));
  });

  const result = await bulkStartCampaigns(["c1", "c2"]);
  assert.equal(result.campaignsErrored.length, 1);
  assert.equal(result.campaignsErrored[0]?.id, "c1");
  assert.equal(result.campaignsProcessed.length, 1);
  assert.equal(result.campaignsProcessed[0]?.campaignId, "c2");
  assert.equal(result.totalSent, 1, "c2's own recipient was still sent despite c1's failure");
  assert.equal(campaigns.get("c2")?.status, OutreachCampaignStatus.COMPLETED);

  restoreEmail.restore();
  campaignFindUnique.restore();
  campaignUpdate.restore();
  recipientFindMany.restore();
  recipientUpdate.restore();
  contactFindUnique.restore();
  groupBy.restore();
});

// ---------------------------------------------------------------------------
// Milestone 198.1, final eligibility correction: bulk selection is
// READY-only. SENDING is deliberately excluded — a campaign already
// partway through is only ever resumed via its own dedicated "Continue
// Sending" action (sendCampaignBatch(), tested directly against a
// SENDING campaign in outreachCampaign.service.test.ts — that path is
// completely unaffected by this correction, since isEligibleForBulkSend()
// is only ever consulted by previewBulkSend()/bulkStartCampaigns()
// below, never by sendCampaignBatch() itself).
// ---------------------------------------------------------------------------

test("previewBulkSend: a READY campaign is eligible", async () => {
  const findMany = stub(prisma.outreachCampaign, "findMany", async () => [campaignRow("c1", { status: OutreachCampaignStatus.READY })]);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.PENDING, _count: { _all: 2 } }]);
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => [
    { contactId: "contact-1", campaignId: "c1", emailSnapshot: "a@example.com", organisationNameSnapshot: "A" },
    { contactId: "contact-2", campaignId: "c1", emailSnapshot: "b@example.com", organisationNameSnapshot: "B" },
  ]);

  const preview = await previewBulkSend(["c1"]);
  assert.equal(preview.campaigns[0]?.eligible, true);
  assert.equal(preview.eligibleCampaigns, 1);

  findMany.restore();
  groupBy.restore();
  recipientFindMany.restore();
});

test("previewBulkSend: a SENDING campaign (even with PENDING recipients) is never eligible — only its own Continue Sending action can resume it", async () => {
  const findMany = stub(prisma.outreachCampaign, "findMany", async () => [campaignRow("c1", { status: OutreachCampaignStatus.SENDING, sendStartedAt: new Date() })]);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.PENDING, _count: { _all: 4 } }]);
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => {
    throw new Error("must never be called for an ineligible campaign — a SENDING campaign contributes nothing to the eligible-recipient/duplicate calculation");
  });

  const preview = await previewBulkSend(["c1"]);
  assert.equal(preview.campaigns[0]?.eligible, false);
  assert.equal(preview.eligibleCampaigns, 0);
  assert.match(preview.campaigns[0]?.ineligibleReason ?? "", /Continue Sending/);

  findMany.restore();
  groupBy.restore();
  recipientFindMany.restore();
});

test("previewBulkSend: DRAFT, COMPLETED and CANCELLED all remain ineligible", async () => {
  const findMany = stub(prisma.outreachCampaign, "findMany", async () => [
    campaignRow("draft", { status: OutreachCampaignStatus.DRAFT }),
    campaignRow("completed", { status: OutreachCampaignStatus.COMPLETED }),
    campaignRow("cancelled", { status: OutreachCampaignStatus.CANCELLED }),
  ]);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => []);
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => []);

  const preview = await previewBulkSend(["draft", "completed", "cancelled"]);
  assert.equal(preview.eligibleCampaigns, 0);
  assert.ok(preview.campaigns.every((c) => c.eligible === false));

  findMany.restore();
  groupBy.restore();
  recipientFindMany.restore();
});

test("bulkStartCampaigns: a SENDING campaign in the selection is skipped, never touched, its PENDING recipients left exactly as they were", async () => {
  const restoreEmail = withEmailDisabled();
  const campaigns = new Map([["c1", campaignRow("c1", { status: OutreachCampaignStatus.SENDING, sendStartedAt: new Date() })]]);
  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async (args: { where: { id: string } }) => campaigns.get(args.where.id) ?? null);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.PENDING, _count: { _all: 3 } }]);
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => {
    throw new Error("must never be called — a SENDING campaign must never be touched by bulk-start");
  });

  const result = await bulkStartCampaigns(["c1"]);
  assert.equal(result.campaignsProcessed.length, 0);
  assert.equal(result.totalSent, 0);
  assert.equal(result.campaignsSkippedIneligible.length, 1);
  assert.match(result.campaignsSkippedIneligible[0]?.reason ?? "", /Continue Sending/);

  restoreEmail.restore();
  campaignFindUnique.restore();
  groupBy.restore();
  recipientFindMany.restore();
});

test("bulkStartCampaigns: a campaign that was READY when selected but has since moved to SENDING (a genuinely concurrent single-campaign send) is excluded at execution, never started twice", async () => {
  const restoreEmail = withEmailDisabled();
  // The campaign's CURRENT server-side state, at the moment bulk-start
  // actually queries it, is already SENDING — simulating that a
  // single-campaign "Continue Sending"/send-batch click elsewhere
  // reached it first, between the owner's selection/confirmation and
  // this execution. bulkStartCampaigns() always re-fetches fresh
  // (never trusts anything computed earlier), so this is exactly what
  // that re-fetch would see.
  const campaigns = new Map([["c1", campaignRow("c1", { status: OutreachCampaignStatus.SENDING, sendStartedAt: new Date() })]]);
  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async (args: { where: { id: string } }) => campaigns.get(args.where.id) ?? null);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.PENDING, _count: { _all: 5 } }]);
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => {
    throw new Error("must never be called — this campaign must be excluded before any recipient is even read");
  });

  // The owner's own browser still believes c1 was READY when they
  // clicked "Start" — it sends the same campaignIds regardless.
  const result = await bulkStartCampaigns(["c1"]);
  assert.equal(result.campaignsProcessed.length, 0);
  assert.equal(result.campaignsSkippedIneligible.length, 1);
  assert.equal(result.campaignsSkippedIneligible[0]?.id, "c1");

  restoreEmail.restore();
  campaignFindUnique.restore();
  groupBy.restore();
  recipientFindMany.restore();
});

test("bulkStartCampaigns: DRAFT/COMPLETED/CANCELLED are all skipped as ineligible in one selection, none touched", async () => {
  const restoreEmail = withEmailDisabled();
  const campaigns = new Map([
    ["draft", campaignRow("draft", { status: OutreachCampaignStatus.DRAFT })],
    ["completed", campaignRow("completed", { status: OutreachCampaignStatus.COMPLETED })],
    ["cancelled", campaignRow("cancelled", { status: OutreachCampaignStatus.CANCELLED })],
  ]);
  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async (args: { where: { id: string } }) => campaigns.get(args.where.id) ?? null);
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => []);
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => {
    throw new Error("must never be called for any of these three ineligible campaigns");
  });

  const result = await bulkStartCampaigns(["draft", "completed", "cancelled"]);
  assert.equal(result.campaignsProcessed.length, 0);
  assert.equal(result.campaignsSkippedIneligible.length, 3);

  restoreEmail.restore();
  campaignFindUnique.restore();
  groupBy.restore();
  recipientFindMany.restore();
});
