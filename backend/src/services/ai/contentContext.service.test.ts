// Content Studio Phase 3A: same stub() pattern as
// brandKnowledge.service.test.ts — every Prisma call here is
// monkeypatched, nothing touches the real (production) database.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../../config/prisma.js";
import { buildContentContext, buildProductContentContext, ContentContextError } from "./contentContext.service.js";

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

const PRODUCT_ROW = {
  id: "prod-1",
  name: "Bible Colouring Book",
  slug: "bible-colouring-book",
  sku: "SG-001",
  description: "A calming colouring book.",
  shortDescription: "For quiet time.",
  price: { toString: () => "150.00" } as unknown as number, // Number() below handles Decimal-shaped stubs
  stockQuantity: 5,
  status: "ACTIVE",
  images: [{ url: "https://example.com/a.jpg" }, { url: "https://example.com/b.jpg" }],
};

const AUDIENCE_ROW = { id: "aud-1", name: "Churches", description: "Church groups.", painPoints: null, motivations: "Faith-based learning.", preferredContent: null, isActive: true };
const PILLAR_ROW = { id: "pillar-1", name: "Bible Learning", description: "Faith-based learning.", isActive: true };

test("buildProductContentContext: reads real Product fields — never invents name/price/stock", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => PRODUCT_ROW);

  const context = await buildProductContentContext("prod-1");

  assert.equal(context.name, "Bible Colouring Book");
  assert.equal(context.price, 150);
  assert.equal(context.stockQuantity, 5);
  assert.equal(context.isInStock, true);
  assert.deepEqual(context.images, ["https://example.com/a.jpg", "https://example.com/b.jpg"]);

  findUnique.restore();
});

test("buildProductContentContext: unknown productId is rejected with 404, never silently returns null facts", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => null);

  await assert.rejects(
    () => buildProductContentContext("missing"),
    (error: unknown) => error instanceof ContentContextError && (error as ContentContextError).statusCode === 404
  );

  findUnique.restore();
});

test("buildContentContext: an inactive audience is rejected, never silently included", async () => {
  const findUniqueAudience = stub(prisma.audience, "findUnique", async () => ({ ...AUDIENCE_ROW, isActive: false }));
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => []);

  await assert.rejects(
    () => buildContentContext({ audienceId: "aud-1", purpose: "test" }),
    (error: unknown) => error instanceof ContentContextError && (error as ContentContextError).statusCode === 409
  );

  findUniqueAudience.restore();
  findMany.restore();
});

test("buildContentContext: an inactive pillar is rejected, never silently included", async () => {
  const findUniquePillar = stub(prisma.contentPillar, "findUnique", async () => ({ ...PILLAR_ROW, isActive: false }));
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => []);

  await assert.rejects(
    () => buildContentContext({ pillarId: "pillar-1", purpose: "test" }),
    (error: unknown) => error instanceof ContentContextError && (error as ContentContextError).statusCode === 409
  );

  findUniquePillar.restore();
  findMany.restore();
});

test("buildContentContext: combines Product, Audience, Pillar and Brand Knowledge into one bounded object", async () => {
  const findUniqueProduct = stub(prisma.product, "findUnique", async () => PRODUCT_ROW);
  const findUniqueAudience = stub(prisma.audience, "findUnique", async () => AUDIENCE_ROW);
  const findUniquePillar = stub(prisma.contentPillar, "findUnique", async () => PILLAR_ROW);
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => [
    { id: "bk-1", category: "WRITING_RULE", title: "t", body: "Use colouring, not coloring.", tags: [], isActive: true, priority: 0, sourceType: "OWNER_APPROVED", sourceReference: null, lastVerifiedAt: null, relatedProductId: null, pillarId: null, audienceId: null, createdByAdminId: null, updatedByAdminId: null, createdAt: new Date(), updatedAt: new Date() },
  ]);

  const context = await buildContentContext({ productId: "prod-1", audienceId: "aud-1", pillarId: "pillar-1", purpose: "test", platforms: ["INSTAGRAM"] });

  assert.equal(context.product?.name, "Bible Colouring Book");
  assert.equal(context.audience?.name, "Churches");
  assert.equal(context.pillar?.name, "Bible Learning");
  assert.equal(context.brandVoice.writingRules.length, 1);
  assert.deepEqual(context.platforms, ["INSTAGRAM"]);

  findUniqueProduct.restore();
  findUniqueAudience.restore();
  findUniquePillar.restore();
  findMany.restore();
});

test("buildContentContext: caps entries per category (context size control)", async () => {
  const manyEntries = Array.from({ length: 25 }, (_, index) => ({
    id: `bk-${index}`,
    category: "WRITING_RULE",
    title: `t${index}`,
    body: `rule ${index}`,
    tags: [],
    isActive: true,
    priority: 0,
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
  }));
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => manyEntries);

  const context = await buildContentContext({ purpose: "test" });

  assert.ok(context.brandVoice.writingRules.length <= 10, `expected at most 10 writing rules, got ${context.brandVoice.writingRules.length}`);

  findMany.restore();
});

// ---------------------------------------------------------------------------
// Security boundary (brief section 21/38): the assembled context must
// never contain a field that could carry Customer/Order/secret data.
// ---------------------------------------------------------------------------

test("buildContentContext: the result contains no field resembling Customer, Order, Address, or credential data", async () => {
  const findUniqueProduct = stub(prisma.product, "findUnique", async () => PRODUCT_ROW);
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => []);

  const context = await buildContentContext({ productId: "prod-1", purpose: "test" });
  const serialised = JSON.stringify(context).toLowerCase();

  const forbiddenSubstrings = ["customerid", "customer_id", "orderid", "order_id", "email", "password", "passwordhash", "sessiontoken", "apikey", "api_key", "idnumber", "id_number", "bankstatement", "creditcard", "secret"];
  for (const forbidden of forbiddenSubstrings) {
    assert.ok(!serialised.includes(forbidden), `context unexpectedly contains "${forbidden}"`);
  }

  findUniqueProduct.restore();
  findMany.restore();
});

test("buildContentContext: never queries prisma.customer, prisma.order, prisma.address, or prisma.adminSession", async () => {
  const forbiddenModels = ["customer", "order", "address", "adminSession", "affiliateApplicationDocument"] as const;
  const guards = forbiddenModels.map((model) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[model];
    return stub(delegate, "findUnique", async () => {
      throw new Error(`buildContentContext must never call prisma.${model}.findUnique`);
    });
  });
  const findUniqueProduct = stub(prisma.product, "findUnique", async () => PRODUCT_ROW);
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => []);

  await buildContentContext({ productId: "prod-1", purpose: "test" });

  guards.forEach((guard) => guard.restore());
  findUniqueProduct.restore();
  findMany.restore();
});

test("production write guard: a full buildContentContext call never reaches any mutating Prisma method — proved by leaving every create/update/delete completely unstubbed", async () => {
  // Deliberately does NOT stub prisma.product.update/create/delete or
  // any other mutating method — installProductionWriteGuard() already
  // wraps every one of them at import time (config/prisma.ts). If
  // buildContentContext ever called one, this test would fail with
  // ProductionWriteBlockedError instead of passing.
  const findUniqueProduct = stub(prisma.product, "findUnique", async () => PRODUCT_ROW);
  const findUniqueAudience = stub(prisma.audience, "findUnique", async () => AUDIENCE_ROW);
  const findUniquePillar = stub(prisma.contentPillar, "findUnique", async () => PILLAR_ROW);
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => []);

  await buildContentContext({ productId: "prod-1", audienceId: "aud-1", pillarId: "pillar-1", purpose: "test" });

  findUniqueProduct.restore();
  findUniqueAudience.restore();
  findUniquePillar.restore();
  findMany.restore();
});
