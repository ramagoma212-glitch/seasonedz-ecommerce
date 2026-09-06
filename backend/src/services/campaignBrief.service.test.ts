// Milestone 182, Part N: campaignBrief.service.ts — Prisma is fully
// stubbed, same discipline as every other *.service.test.ts in this
// codebase (production write guard proves nothing here ever reaches
// the real database).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma, CampaignBriefStatus } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import {
  createCampaignBrief,
  updateCampaignBrief,
  regenerateCampaignBrief,
  updateCampaignBriefStatus,
  archiveCampaignBrief,
  createCampaignContentRecord,
  updateCampaignContentRecord,
  deleteCampaignContentRecord,
  CampaignBriefError,
} from "./campaignBrief.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

const PRODUCT_ROW = {
  id: "prod-1",
  name: "Old Testament Bible Colouring Book",
  slug: "old-testament-bible-colouring-book",
  sku: "SG-002",
  description: "A calming colouring book.",
  shortDescription: "For quiet family time.",
  price: new Prisma.Decimal("120.00"),
  stockQuantity: 100,
  status: "ACTIVE",
  images: [],
  isPreorderEnabled: false,
  preorderStartAt: null,
  preorderEndAt: null,
  preorderReleaseAt: null,
  isPreorderDiscountEligible: false,
};

const AUDIENCE_ROW = { id: "aud-1", name: "Churches", description: "Church groups.", painPoints: null, motivations: null, preferredContent: null, isActive: true };
const PILLAR_ROW = { id: "pillar-1", name: "Bible Learning", description: "Faith-based learning.", isActive: true };

const PREORDER_SETTINGS_ROW = {
  id: "settings-1",
  firstRegisteredPreorderDiscountEnabled: true,
  firstRegisteredPreorderDiscountPercent: new Prisma.Decimal("10.00"),
  updatedByAdminUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function stubContextDependencies(productOverrides: Record<string, unknown> = {}) {
  const productFindUnique = stub(prisma.product, "findUnique", async () => ({ ...PRODUCT_ROW, ...productOverrides }));
  const audienceFindUnique = stub(prisma.audience, "findUnique", async () => AUDIENCE_ROW);
  const pillarFindUnique = stub(prisma.contentPillar, "findUnique", async () => PILLAR_ROW);
  const brandKnowledgeFindMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => []);
  const settingsFindFirst = stub(prisma.preorderProgrammeSettings, "findFirst", async () => PREORDER_SETTINGS_ROW);
  return {
    restore: () => {
      productFindUnique.restore();
      audienceFindUnique.restore();
      pillarFindUnique.restore();
      brandKnowledgeFindMany.restore();
      settingsFindFirst.restore();
    },
  };
}

function fakeBriefRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "brief-1",
    productId: "prod-1",
    product: { id: "prod-1", name: PRODUCT_ROW.name, slug: PRODUCT_ROW.slug, price: PRODUCT_ROW.price },
    audienceId: "aud-1",
    audience: { id: "aud-1", name: AUDIENCE_ROW.name },
    pillarId: "pillar-1",
    pillar: { id: "pillar-1", name: PILLAR_ROW.name },
    platforms: ["INSTAGRAM"],
    goal: "AWARENESS",
    campaignType: null,
    contentQuantity: null,
    campaignStartAt: null,
    campaignEndAt: null,
    callToAction: null,
    additionalInstructions: null,
    generatedBriefText: "ZEELY CAMPAIGN BRIEF\n...",
    generatedAt: new Date(),
    status: CampaignBriefStatus.DRAFT,
    createdByAdmin: null,
    updatedByAdmin: null,
    contentRecords: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const VALID_INPUT = {
  productId: "prod-1",
  audienceId: "aud-1",
  pillarId: "pillar-1",
  platforms: ["INSTAGRAM"],
  goal: "AWARENESS",
};

// ---------------------------------------------------------------------------
// Field selection / validation
// ---------------------------------------------------------------------------

test("createCampaignBrief: rejects a missing productId", async () => {
  await assert.rejects(() => createCampaignBrief({ ...VALID_INPUT, productId: undefined }, "admin-1"), (error: unknown) => error instanceof CampaignBriefError && /productId/.test(error.message));
});

test("createCampaignBrief: rejects a missing audienceId", async () => {
  await assert.rejects(() => createCampaignBrief({ ...VALID_INPUT, audienceId: undefined }, "admin-1"), (error: unknown) => error instanceof CampaignBriefError && /audienceId/.test(error.message));
});

test("createCampaignBrief: rejects a missing pillarId", async () => {
  await assert.rejects(() => createCampaignBrief({ ...VALID_INPUT, pillarId: undefined }, "admin-1"), (error: unknown) => error instanceof CampaignBriefError && /pillarId/.test(error.message));
});

test("createCampaignBrief: rejects an empty platforms array", async () => {
  await assert.rejects(() => createCampaignBrief({ ...VALID_INPUT, platforms: [] }, "admin-1"), (error: unknown) => error instanceof CampaignBriefError && /platform/i.test(error.message));
});

test("createCampaignBrief: accepts multiple valid platforms", async () => {
  const deps = stubContextDependencies();
  const create = stub(prisma.campaignBrief, "create", async ({ data }: { data: Record<string, unknown> }) => fakeBriefRow({ platforms: data.platforms }));

  const brief = await createCampaignBrief({ ...VALID_INPUT, platforms: ["INSTAGRAM", "TIKTOK", "WHATSAPP"] }, "admin-1");
  assert.deepEqual(brief.platforms, ["INSTAGRAM", "TIKTOK", "WHATSAPP"]);

  deps.restore();
  create.restore();
});

test("createCampaignBrief: rejects an unrecognised platform value", async () => {
  await assert.rejects(() => createCampaignBrief({ ...VALID_INPUT, platforms: ["SNAPCHAT"] }, "admin-1"), (error: unknown) => error instanceof CampaignBriefError && /platform/i.test(error.message));
});

test("createCampaignBrief: rejects an unrecognised campaign goal", async () => {
  await assert.rejects(() => createCampaignBrief({ ...VALID_INPUT, goal: "GO_VIRAL" }, "admin-1"), (error: unknown) => error instanceof CampaignBriefError && /goal/.test(error.message));
});

test("createCampaignBrief: rejects an unknown product id (surfaces the ContentContextError as a 404 CampaignBriefError)", async () => {
  const productFindUnique = stub(prisma.product, "findUnique", async () => null);
  await assert.rejects(
    () => createCampaignBrief(VALID_INPUT, "admin-1"),
    (error: unknown) => error instanceof CampaignBriefError && error.statusCode === 404
  );
  productFindUnique.restore();
});

test("createCampaignBrief: rejects an inactive audience", async () => {
  const productFindUnique = stub(prisma.product, "findUnique", async () => PRODUCT_ROW);
  const audienceFindUnique = stub(prisma.audience, "findUnique", async () => ({ ...AUDIENCE_ROW, isActive: false }));
  await assert.rejects(
    () => createCampaignBrief(VALID_INPUT, "admin-1"),
    (error: unknown) => error instanceof CampaignBriefError && error.statusCode === 409
  );
  productFindUnique.restore();
  audienceFindUnique.restore();
});

test("createCampaignBrief: rejects an inactive content pillar", async () => {
  const productFindUnique = stub(prisma.product, "findUnique", async () => PRODUCT_ROW);
  const audienceFindUnique = stub(prisma.audience, "findUnique", async () => AUDIENCE_ROW);
  const pillarFindUnique = stub(prisma.contentPillar, "findUnique", async () => ({ ...PILLAR_ROW, isActive: false }));
  await assert.rejects(
    () => createCampaignBrief(VALID_INPUT, "admin-1"),
    (error: unknown) => error instanceof CampaignBriefError && error.statusCode === 409
  );
  productFindUnique.restore();
  audienceFindUnique.restore();
  pillarFindUnique.restore();
});

test("createCampaignBrief: campaignEndAt before campaignStartAt is rejected", async () => {
  await assert.rejects(
    () => createCampaignBrief({ ...VALID_INPUT, campaignStartAt: "2026-09-20T00:00:00.000Z", campaignEndAt: "2026-09-10T00:00:00.000Z" }, "admin-1"),
    (error: unknown) => error instanceof CampaignBriefError
  );
});

// ---------------------------------------------------------------------------
// Preorder context
// ---------------------------------------------------------------------------

test("createCampaignBrief: an active preorder product produces a brief that mentions preorder and the real release date", async () => {
  const deps = stubContextDependencies({ isPreorderEnabled: true, preorderReleaseAt: new Date("2026-09-29T22:00:00.000Z"), isPreorderDiscountEligible: true });
  let capturedText = "";
  const create = stub(prisma.campaignBrief, "create", async ({ data }: { data: Record<string, unknown> }) => {
    capturedText = data.generatedBriefText as string;
    return fakeBriefRow({ generatedBriefText: capturedText });
  });

  const brief = await createCampaignBrief({ ...VALID_INPUT, goal: "PREORDER" }, "admin-1");
  assert.ok(brief.generatedBriefText.includes("PREORDER"));
  assert.ok(brief.generatedBriefText.includes("Available from 30 September 2026"));
  assert.ok(brief.generatedBriefText.includes("10% off their first qualifying preorder"));

  deps.restore();
  create.restore();
});

test("createCampaignBrief: a non-preorder product never mentions preorder", async () => {
  const deps = stubContextDependencies(); // isPreorderEnabled: false by default
  const create = stub(prisma.campaignBrief, "create", async ({ data }: { data: Record<string, unknown> }) => fakeBriefRow({ generatedBriefText: data.generatedBriefText }));

  const brief = await createCampaignBrief(VALID_INPUT, "admin-1");
  assert.ok(!brief.generatedBriefText.toLowerCase().includes("preorder"));

  deps.restore();
  create.restore();
});

test("createCampaignBrief: a product whose preorder window has ended is treated as a normal sale, not a preorder", async () => {
  const deps = stubContextDependencies({ isPreorderEnabled: true, preorderReleaseAt: new Date("2020-01-01T00:00:00.000Z") }); // long ended
  const create = stub(prisma.campaignBrief, "create", async ({ data }: { data: Record<string, unknown> }) => fakeBriefRow({ generatedBriefText: data.generatedBriefText }));

  const brief = await createCampaignBrief(VALID_INPUT, "admin-1");
  assert.ok(!brief.generatedBriefText.toLowerCase().includes("preorder"));

  deps.restore();
  create.restore();
});

test("createCampaignBrief: preorder-eligible but the programme is disabled — no discount mentioned", async () => {
  const productFindUnique = stub(prisma.product, "findUnique", async () => ({ ...PRODUCT_ROW, isPreorderEnabled: true, preorderReleaseAt: new Date("2026-09-29T22:00:00.000Z"), isPreorderDiscountEligible: true }));
  const audienceFindUnique = stub(prisma.audience, "findUnique", async () => AUDIENCE_ROW);
  const pillarFindUnique = stub(prisma.contentPillar, "findUnique", async () => PILLAR_ROW);
  const brandKnowledgeFindMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => []);
  const settingsFindFirst = stub(prisma.preorderProgrammeSettings, "findFirst", async () => ({ ...PREORDER_SETTINGS_ROW, firstRegisteredPreorderDiscountEnabled: false }));
  const create = stub(prisma.campaignBrief, "create", async ({ data }: { data: Record<string, unknown> }) => fakeBriefRow({ generatedBriefText: data.generatedBriefText }));

  const brief = await createCampaignBrief({ ...VALID_INPUT, goal: "PREORDER" }, "admin-1");
  assert.ok(!brief.generatedBriefText.includes("off their first qualifying preorder"));

  productFindUnique.restore();
  audienceFindUnique.restore();
  pillarFindUnique.restore();
  brandKnowledgeFindMany.restore();
  settingsFindFirst.restore();
  create.restore();
});

// ---------------------------------------------------------------------------
// Brand knowledge retrieval
// ---------------------------------------------------------------------------

test("createCampaignBrief: approved and prohibited claims from Brand Knowledge reach the generated brief", async () => {
  const productFindUnique = stub(prisma.product, "findUnique", async () => PRODUCT_ROW);
  const audienceFindUnique = stub(prisma.audience, "findUnique", async () => AUDIENCE_ROW);
  const pillarFindUnique = stub(prisma.contentPillar, "findUnique", async () => PILLAR_ROW);
  function brandKnowledgeRow(overrides: Record<string, unknown>) {
    return {
      id: "bk",
      title: "Rule",
      priority: 0,
      isActive: true,
      tags: [],
      sourceType: "OWNER_APPROVED",
      sourceReference: null,
      lastVerifiedAt: null,
      relatedProductId: null,
      pillarId: null,
      audienceId: null,
      createdByAdminId: null,
      updatedByAdminId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }
  const brandKnowledgeFindMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => [
    brandKnowledgeRow({ id: "bk-1", category: "APPROVED_CLAIM", body: "Screen-free creative time." }),
    brandKnowledgeRow({ id: "bk-2", category: "PROHIBITED_CLAIM", body: "Never claim a medical benefit." }),
  ]);
  const settingsFindFirst = stub(prisma.preorderProgrammeSettings, "findFirst", async () => PREORDER_SETTINGS_ROW);
  const create = stub(prisma.campaignBrief, "create", async ({ data }: { data: Record<string, unknown> }) => fakeBriefRow({ generatedBriefText: data.generatedBriefText }));

  const brief = await createCampaignBrief(VALID_INPUT, "admin-1");
  assert.ok(brief.generatedBriefText.includes("Screen-free creative time."));
  assert.ok(brief.generatedBriefText.includes("Never claim a medical benefit."));

  productFindUnique.restore();
  audienceFindUnique.restore();
  pillarFindUnique.restore();
  brandKnowledgeFindMany.restore();
  settingsFindFirst.restore();
  create.restore();
});

// ---------------------------------------------------------------------------
// Update / regenerate / status / archive
// ---------------------------------------------------------------------------

test("updateCampaignBrief: editing the goal regenerates generatedBriefText", async () => {
  const findUnique = stub(prisma.campaignBrief, "findUnique", async () => fakeBriefRow());
  const deps = stubContextDependencies();
  const update = stub(prisma.campaignBrief, "update", async ({ data }: { data: Record<string, unknown> }) => fakeBriefRow({ goal: data.goal, generatedBriefText: data.generatedBriefText }));

  const brief = await updateCampaignBrief("brief-1", { goal: "SALES" }, "admin-1");
  assert.equal(brief.goal, "SALES");
  assert.equal(update.fn.mock.callCount(), 1);

  findUnique.restore();
  deps.restore();
  update.restore();
});

test("updateCampaignBrief: rejects editing an ARCHIVED brief", async () => {
  const findUnique = stub(prisma.campaignBrief, "findUnique", async () => fakeBriefRow({ status: CampaignBriefStatus.ARCHIVED }));
  await assert.rejects(
    () => updateCampaignBrief("brief-1", { goal: "SALES" }, "admin-1"),
    (error: unknown) => error instanceof CampaignBriefError && error.statusCode === 409
  );
  findUnique.restore();
});

test("regenerateCampaignBrief: re-reads current data without changing any stored input field", async () => {
  const findUnique = stub(prisma.campaignBrief, "findUnique", async () => fakeBriefRow());
  const deps = stubContextDependencies({ isPreorderEnabled: true, preorderReleaseAt: new Date("2026-09-29T22:00:00.000Z") });
  const update = stub(prisma.campaignBrief, "update", async ({ data }: { data: Record<string, unknown> }) => fakeBriefRow({ generatedBriefText: data.generatedBriefText }));

  const brief = await regenerateCampaignBrief("brief-1", "admin-1");
  assert.ok(brief.generatedBriefText.includes("PREORDER"));

  findUnique.restore();
  deps.restore();
  update.restore();
});

test("updateCampaignBriefStatus: DRAFT to READY_FOR_ZEELY is allowed", async () => {
  const findUnique = stub(prisma.campaignBrief, "findUnique", async () => fakeBriefRow({ status: CampaignBriefStatus.DRAFT }));
  const update = stub(prisma.campaignBrief, "update", async ({ data }: { data: Record<string, unknown> }) => fakeBriefRow({ status: data.status }));

  const brief = await updateCampaignBriefStatus("brief-1", "READY_FOR_ZEELY", "admin-1");
  assert.equal(brief.status, "READY_FOR_ZEELY");

  findUnique.restore();
  update.restore();
});

test("updateCampaignBriefStatus: DRAFT to PUBLISHED (skipping steps) is rejected", async () => {
  const findUnique = stub(prisma.campaignBrief, "findUnique", async () => fakeBriefRow({ status: CampaignBriefStatus.DRAFT }));
  await assert.rejects(
    () => updateCampaignBriefStatus("brief-1", "PUBLISHED", "admin-1"),
    (error: unknown) => error instanceof CampaignBriefError && error.statusCode === 409
  );
  findUnique.restore();
});

test("updateCampaignBriefStatus: cannot set status to ARCHIVED through the general status route", async () => {
  await assert.rejects(() => updateCampaignBriefStatus("brief-1", "ARCHIVED", "admin-1"), (error: unknown) => error instanceof CampaignBriefError);
});

test("archiveCampaignBrief: archives a DRAFT brief", async () => {
  const findUnique = stub(prisma.campaignBrief, "findUnique", async () => fakeBriefRow({ status: CampaignBriefStatus.DRAFT }));
  const update = stub(prisma.campaignBrief, "update", async ({ data }: { data: Record<string, unknown> }) => fakeBriefRow({ status: data.status }));

  const brief = await archiveCampaignBrief("brief-1", "admin-1");
  assert.equal(brief.status, "ARCHIVED");

  findUnique.restore();
  update.restore();
});

test("archiveCampaignBrief: archiving an already-archived brief is rejected", async () => {
  const findUnique = stub(prisma.campaignBrief, "findUnique", async () => fakeBriefRow({ status: CampaignBriefStatus.ARCHIVED }));
  await assert.rejects(
    () => archiveCampaignBrief("brief-1", "admin-1"),
    (error: unknown) => error instanceof CampaignBriefError && error.statusCode === 409
  );
  findUnique.restore();
});

// ---------------------------------------------------------------------------
// Content records
// ---------------------------------------------------------------------------

test("createCampaignContentRecord: requires contentType", async () => {
  const briefFindUnique = stub(prisma.campaignBrief, "findUnique", async () => ({ id: "brief-1" }));
  await assert.rejects(() => createCampaignContentRecord("brief-1", {}, "admin-1"), (error: unknown) => error instanceof CampaignBriefError);
  briefFindUnique.restore();
});

test("createCampaignContentRecord: creates a record with the given fields", async () => {
  const briefFindUnique = stub(prisma.campaignBrief, "findUnique", async () => ({ id: "brief-1" }));
  const create = stub(prisma.campaignContentRecord, "create", async ({ data }: { data: Record<string, unknown> }) => ({
    id: "record-1",
    contentType: data.contentType,
    platform: data.platform ?? null,
    caption: data.caption ?? null,
    notes: data.notes ?? null,
    scheduledAt: data.scheduledAt ?? null,
    publishedAt: data.publishedAt ?? null,
    externalReference: data.externalReference ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const record = await createCampaignContentRecord("brief-1", { contentType: "Reel", platform: "INSTAGRAM", caption: "A caption." }, "admin-1");
  assert.equal(record.contentType, "Reel");
  assert.equal(record.platform, "INSTAGRAM");

  briefFindUnique.restore();
  create.restore();
});

test("updateCampaignContentRecord: updates only the fields present in the input", async () => {
  const findUnique = stub(prisma.campaignContentRecord, "findUnique", async () => ({ id: "record-1", contentType: "Reel", platform: null, caption: null, notes: null, scheduledAt: null, publishedAt: null, externalReference: null }));
  const update = stub(prisma.campaignContentRecord, "update", async ({ data }: { data: Record<string, unknown> }) => ({
    id: "record-1",
    contentType: "Reel",
    platform: null,
    caption: data.caption,
    notes: null,
    scheduledAt: null,
    publishedAt: null,
    externalReference: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const record = await updateCampaignContentRecord("record-1", { caption: "Updated caption." });
  assert.equal(record.caption, "Updated caption.");

  findUnique.restore();
  update.restore();
});

test("deleteCampaignContentRecord: deletes an existing record", async () => {
  const findUnique = stub(prisma.campaignContentRecord, "findUnique", async () => ({ id: "record-1" }));
  const del = stub(prisma.campaignContentRecord, "delete", async () => ({}));

  await deleteCampaignContentRecord("record-1");
  assert.equal(del.fn.mock.callCount(), 1);

  findUnique.restore();
  del.restore();
});

test("deleteCampaignContentRecord: a missing record is rejected with 404", async () => {
  const findUnique = stub(prisma.campaignContentRecord, "findUnique", async () => null);
  await assert.rejects(
    () => deleteCampaignContentRecord("record-missing"),
    (error: unknown) => error instanceof CampaignBriefError && error.statusCode === 404
  );
  findUnique.restore();
});
