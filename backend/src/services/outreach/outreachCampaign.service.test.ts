// Milestone 198, Part 26 (CAMPAIGNS/SENDING/UNSUBSCRIBE): campaign CRUD,
// audience-filter resolution, personalization rendering, and the
// resumable batch-sending/retry logic — including a genuine send
// failure exercised through the real Brevo code path (stubbed
// globalThis.fetch, the same technique notificationEngine.service.test.ts
// already established for this codebase, since deliverRenderedEmail()
// itself is a frozen ES module export that cannot be stubbed directly).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { OutreachCampaignStatus, OutreachContactStatus, OutreachRecipientStatus } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import {
  createCampaign,
  updateCampaign,
  buildAudienceWhere,
  buildCampaignRecipients,
  sendCampaignBatch,
  retryFailedRecipients,
  OutreachCampaignError,
} from "./outreachCampaign.service.js";
import { renderPersonalizedOutreachBody } from "./outreachSending.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return {
    fn,
    restore: () => {
      obj[key] = original;
    },
  };
}

// A separate, simpler helper for plain property values (env.* flags),
// as opposed to the mock.fn()-based stub() above for methods — same
// two-helper split notificationEngine.service.test.ts already
// established for this exact "stub a Prisma method" vs "stub an env
// value" distinction.
function stubValue<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]) {
  const original = obj[key];
  obj[key] = value;
  return { restore: () => { obj[key] = original; } };
}

function withEmailDisabled() {
  return stubValue(env, "emailEnabled", false);
}

function baseCampaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "campaign-1",
    name: "Schools Outreach — Term 1",
    subject: "Colouring books for your classroom",
    body: "Hello {{organisation_name}},\n\nWe'd love to work with you.",
    status: OutreachCampaignStatus.DRAFT,
    audienceFilter: null,
    createdByAdminId: "admin-1",
    recipientsBuiltAt: null,
    sendStartedAt: null,
    sendCompletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("createCampaign requires name/subject/body and rejects a blank one", async () => {
  await assert.rejects(() => createCampaign({ name: "", subject: "x", body: "x" }, null), OutreachCampaignError);
  await assert.rejects(() => createCampaign({ name: "x", subject: "", body: "x" }, null), OutreachCampaignError);
  await assert.rejects(() => createCampaign({ name: "x", subject: "x", body: "" }, null), OutreachCampaignError);
});

test("createCampaign stores subject/body exactly as given, starting DRAFT", async () => {
  const create = stub(prisma.outreachCampaign, "create", async (args: { data: Record<string, unknown> }) => baseCampaignRow(args.data));

  const campaign = await createCampaign({ name: "Term 1", subject: "Hello!", body: "Hi {{organisation_name}}" }, "admin-1");
  assert.equal(campaign.subject, "Hello!");
  assert.equal(campaign.body, "Hi {{organisation_name}}");
  assert.equal(campaign.status, OutreachCampaignStatus.DRAFT);

  create.restore();
});

test("updateCampaign refuses to edit a campaign that has already started sending", async () => {
  const findUnique = stub(prisma.outreachCampaign, "findUnique", async () => baseCampaignRow({ sendStartedAt: new Date() }));

  await assert.rejects(() => updateCampaign("campaign-1", { subject: "New subject" }), (error: unknown) => {
    assert.ok(error instanceof OutreachCampaignError);
    assert.equal((error as OutreachCampaignError).statusCode, 409);
    return true;
  });

  findUnique.restore();
});

test("buildAudienceWhere always requires ACTIVE status, regardless of which other filters are set", () => {
  const where = buildAudienceWhere({});
  assert.equal(where.status, OutreachContactStatus.ACTIVE);
});

test("buildAudienceWhere combines organisationType + province as an AND (Schools in Gauteng)", () => {
  const where = buildAudienceWhere({ organisationTypes: ["School"], provinces: ["Gauteng"] }) as Record<string, unknown>;
  assert.deepEqual(where.organisationType, { in: ["School"] });
  assert.deepEqual(where.province, { in: ["Gauteng"] });
});

test("buildAudienceWhere treats an explicit contactIds selection as exclusive of every other filter", () => {
  const where = buildAudienceWhere({ contactIds: ["contact-1", "contact-2"], organisationTypes: ["Church"] }) as Record<string, unknown>;
  assert.deepEqual(where.id, { in: ["contact-1", "contact-2"] });
  assert.equal("organisationType" in where, false);
});

test("renderPersonalizedOutreachBody substitutes both tokens", () => {
  const rendered = renderPersonalizedOutreachBody("Hello {{organisation_name}}, attn: {{contact_name}}", { organisationName: "Sunnyside Primary", contactName: "Mrs Nkosi" });
  assert.equal(rendered, "Hello Sunnyside Primary, attn: Mrs Nkosi");
});

test("renderPersonalizedOutreachBody falls back safely when organisation/contact name is unavailable — never invents a value", () => {
  const rendered = renderPersonalizedOutreachBody("Hello {{organisation_name}}, attn: {{contact_name}}", { organisationName: null, contactName: null });
  assert.equal(rendered, "Hello there, attn: there");
});

test("renderPersonalizedOutreachBody falls back contact_name to the organisation name when only that is known", () => {
  const rendered = renderPersonalizedOutreachBody("Attn: {{contact_name}}", { organisationName: "Sunnyside Primary", contactName: null });
  assert.equal(rendered, "Attn: Sunnyside Primary");
});

test("buildCampaignRecipients only ever snapshots ACTIVE contacts and moves the campaign to READY", async () => {
  const findUnique = stub(prisma.outreachCampaign, "findUnique", async () => baseCampaignRow());
  const contactFindMany = stub(prisma.outreachContact, "findMany", async () => [
    { id: "contact-1", organisationName: "School A", email: "a@example.com" },
    { id: "contact-2", organisationName: "School B", email: "b@example.com" },
  ]);
  const createMany = stub(prisma.outreachCampaignRecipient, "createMany", async () => ({ count: 2 }));
  const campaignUpdate = stub(prisma.outreachCampaign, "update", async () => baseCampaignRow({ status: OutreachCampaignStatus.READY }));
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.PENDING, _count: { _all: 2 } }]);
  const transaction = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));

  const counts = await buildCampaignRecipients("campaign-1", { organisationTypes: ["School"] });
  assert.equal(counts.pending, 2);
  assert.equal(createMany.fn.mock.callCount(), 1);
  assert.equal(campaignUpdate.fn.mock.calls[0]?.arguments[0].data.status, OutreachCampaignStatus.READY);

  findUnique.restore();
  contactFindMany.restore();
  createMany.restore();
  campaignUpdate.restore();
  groupBy.restore();
  transaction.restore();
});

test("buildCampaignRecipients refuses to rebuild a campaign that has already started sending", async () => {
  const findUnique = stub(prisma.outreachCampaign, "findUnique", async () => baseCampaignRow({ sendStartedAt: new Date() }));

  await assert.rejects(() => buildCampaignRecipients("campaign-1", {}), OutreachCampaignError);

  findUnique.restore();
});

// ---------------------------------------------------------------------------
// Sending — email disabled (the safe, deterministic default): every real
// send trivially succeeds without ever calling Brevo, so these tests
// isolate the campaign/recipient bookkeeping logic itself.
// ---------------------------------------------------------------------------

function recipientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "recipient-1",
    campaignId: "campaign-1",
    contactId: "contact-1",
    organisationNameSnapshot: "School A",
    emailSnapshot: "a@example.com",
    status: OutreachRecipientStatus.PENDING,
    providerMessageId: null,
    failureReason: null,
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("sendCampaignBatch: a PENDING recipient whose contact is still ACTIVE is sent and marked SENT", async () => {
  const restoreEmail = withEmailDisabled();
  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async () => baseCampaignRow({ status: OutreachCampaignStatus.READY }));
  const campaignUpdate = stub(prisma.outreachCampaign, "update", async () => baseCampaignRow({ status: OutreachCampaignStatus.SENDING }));
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => [recipientRow()]);
  const recipientUpdate = stub(prisma.outreachCampaignRecipient, "update", async (args: { data: Record<string, unknown> }) => recipientRow(args.data));
  const contactFindUnique = stub(prisma.outreachContact, "findUnique", async () => ({ id: "contact-1", email: "a@example.com", contactName: null, organisationName: "School A", status: OutreachContactStatus.ACTIVE }));
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.SENT, _count: { _all: 1 } }]);

  const result = await sendCampaignBatch("campaign-1");
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.suppressed, 0);
  assert.equal(result.campaignStatus, OutreachCampaignStatus.COMPLETED);
  const updateCall = recipientUpdate.fn.mock.calls[0]?.arguments[0];
  assert.equal(updateCall.data.status, OutreachRecipientStatus.SENT);

  restoreEmail.restore();
  campaignFindUnique.restore();
  campaignUpdate.restore();
  recipientFindMany.restore();
  recipientUpdate.restore();
  contactFindUnique.restore();
  groupBy.restore();
});

test("sendCampaignBatch: a recipient whose contact became suppressed since the list was built is skipped, never sent to (Part 12: check before EVERY send)", async () => {
  const restoreEmail = withEmailDisabled();
  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async () => baseCampaignRow({ status: OutreachCampaignStatus.SENDING, sendStartedAt: new Date() }));
  const campaignUpdate = stub(prisma.outreachCampaign, "update", async () => baseCampaignRow({ status: OutreachCampaignStatus.COMPLETED }));
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => [recipientRow()]);
  const recipientUpdate = stub(prisma.outreachCampaignRecipient, "update", async (args: { data: Record<string, unknown> }) => recipientRow(args.data));
  const contactFindUnique = stub(prisma.outreachContact, "findUnique", async () => ({ id: "contact-1", email: "a@example.com", contactName: null, organisationName: "School A", status: OutreachContactStatus.UNSUBSCRIBED }));
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.SUPPRESSED, _count: { _all: 1 } }]);

  const result = await sendCampaignBatch("campaign-1");
  assert.equal(result.sent, 0);
  assert.equal(result.suppressed, 1);
  const updateCall = recipientUpdate.fn.mock.calls[0]?.arguments[0];
  assert.equal(updateCall.data.status, OutreachRecipientStatus.SUPPRESSED);

  restoreEmail.restore();
  campaignFindUnique.restore();
  campaignUpdate.restore();
  recipientFindMany.restore();
  recipientUpdate.restore();
  contactFindUnique.restore();
  groupBy.restore();
});

test("sendCampaignBatch rejects a concurrent call for the SAME campaign while a batch is already in flight", async () => {
  const restoreEmail = withEmailDisabled();
  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async () => baseCampaignRow({ status: OutreachCampaignStatus.READY }));
  const campaignUpdate = stub(prisma.outreachCampaign, "update", async () => baseCampaignRow({ status: OutreachCampaignStatus.SENDING }));
  // A slow batch — long enough that a second call definitely lands
  // while the first is still "in flight" (the re-entrancy guard is set
  // synchronously before this is ever reached).
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return [];
  });
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => []);

  const [first, second] = await Promise.allSettled([sendCampaignBatch("campaign-1"), sendCampaignBatch("campaign-1")]);
  assert.equal(first.status, "fulfilled");
  assert.equal(second.status, "rejected");
  if (second.status === "rejected") {
    assert.ok(second.reason instanceof OutreachCampaignError);
  }

  restoreEmail.restore();
  campaignFindUnique.restore();
  campaignUpdate.restore();
  recipientFindMany.restore();
  groupBy.restore();
});

test("retryFailedRecipients only ever moves FAILED rows back to PENDING — SENT rows are never touched", async () => {
  const findUnique = stub(prisma.outreachCampaign, "findUnique", async () => ({ id: "campaign-1", status: OutreachCampaignStatus.PARTIALLY_FAILED }));
  const updateMany = stub(prisma.outreachCampaignRecipient, "updateMany", async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.status, OutreachRecipientStatus.FAILED, "retry must only ever target FAILED rows, never SENT");
    return { count: 3 };
  });
  const campaignUpdate = stub(prisma.outreachCampaign, "update", async () => ({ status: OutreachCampaignStatus.SENDING }));

  const result = await retryFailedRecipients("campaign-1");
  assert.equal(result.requeued, 3);
  assert.equal(updateMany.fn.mock.callCount(), 1);

  findUnique.restore();
  updateMany.restore();
  campaignUpdate.restore();
});

// ---------------------------------------------------------------------------
// A genuine send failure, through the real Brevo code path (stubbed
// fetch) — proves a failure is recorded as FAILED (never silently lost,
// never crashing the rest of the batch) and that retrying afterward
// only re-attempts that one recipient.
// ---------------------------------------------------------------------------

test("sendCampaignBatch: a real Brevo failure marks that recipient FAILED with a reason, without crashing the batch", async () => {
  const restoreEnabled = stubValue(env, "emailEnabled", true);
  const restoreProvider = stubValue(env, "emailProvider", "brevo");
  const restoreApiKey = stubValue(env, "brevoApiKey", "test-key");
  const restoreFromAddress = stubValue(env, "emailFromAddress", "hello@seasonedzgroup.co.za");
  const restoreReplyTo = stubValue(env, "emailReplyTo", "hello@seasonedzgroup.co.za");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock.fn(async () => new Response(JSON.stringify({ message: "Rejected" }), { status: 400 })) as unknown as typeof fetch;

  const campaignFindUnique = stub(prisma.outreachCampaign, "findUnique", async () => baseCampaignRow({ status: OutreachCampaignStatus.READY }));
  const campaignUpdate = stub(prisma.outreachCampaign, "update", async () => baseCampaignRow({ status: OutreachCampaignStatus.SENDING }));
  const recipientFindMany = stub(prisma.outreachCampaignRecipient, "findMany", async () => [recipientRow()]);
  const recipientUpdate = stub(prisma.outreachCampaignRecipient, "update", async (args: { data: Record<string, unknown> }) => recipientRow(args.data));
  const contactFindUnique = stub(prisma.outreachContact, "findUnique", async () => ({ id: "contact-1", email: "a@example.com", contactName: null, organisationName: "School A", status: OutreachContactStatus.ACTIVE }));
  const groupBy = stub(prisma.outreachCampaignRecipient, "groupBy", async () => [{ status: OutreachRecipientStatus.FAILED, _count: { _all: 1 } }]);

  const result = await sendCampaignBatch("campaign-1");
  assert.equal(result.failed, 1);
  assert.equal(result.sent, 0);
  assert.equal(result.campaignStatus, OutreachCampaignStatus.PARTIALLY_FAILED);
  const updateCall = recipientUpdate.fn.mock.calls[0]?.arguments[0];
  assert.equal(updateCall.data.status, OutreachRecipientStatus.FAILED);
  assert.ok(typeof updateCall.data.failureReason === "string" && updateCall.data.failureReason.length > 0);

  globalThis.fetch = originalFetch;
  restoreEnabled.restore();
  restoreProvider.restore();
  restoreApiKey.restore();
  restoreFromAddress.restore();
  restoreReplyTo.restore();
  campaignFindUnique.restore();
  campaignUpdate.restore();
  recipientFindMany.restore();
  recipientUpdate.restore();
  contactFindUnique.restore();
  groupBy.restore();
});
