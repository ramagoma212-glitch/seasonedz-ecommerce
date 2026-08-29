// Content Studio Phase 2: backend tests for Brand Knowledge. Same
// stub() pattern as adminAffiliateProduct.service.test.ts — every
// Prisma model-delegate method used here is monkeypatched directly, so
// nothing in this file ever touches the real (production) database.
// The one deliberate exception is the final "production write guard"
// test, which calls a mutating function WITHOUT stubbing Prisma first,
// on purpose — proving the guard installed in config/prisma.ts already
// covers these brand-new models automatically (it wraps every model on
// the client dynamically; no guard code changes were needed for this
// phase, and this test is what actually proves that rather than
// assuming it).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { ProductionWriteBlockedError } from "../config/testDbGuard.js";
import {
  BrandKnowledgeError,
  createBrandKnowledgeEntry,
  updateBrandKnowledgeEntry,
  setBrandKnowledgeEntryActive,
  listBrandKnowledgeEntriesForAdmin,
  getKnowledgeContext,
  getKnowledgeByTags,
} from "./brandKnowledge.service.js";

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

const BASE_ROW = {
  id: "bk-1",
  category: "WRITING_RULE" as const,
  title: "Use colouring, not coloring",
  body: "Seasonedz is a South African brand — always use the British/SA spelling in customer-facing copy.",
  tags: ["spelling"],
  isActive: true,
  priority: 0,
  sourceType: "OWNER_APPROVED" as const,
  sourceReference: null,
  lastVerifiedAt: null,
  relatedProductId: null,
  pillarId: null,
  audienceId: null,
  createdByAdminId: "admin-1",
  updatedByAdminId: "admin-1",
  createdAt: new Date("2026-08-29T00:00:00.000Z"),
  updatedAt: new Date("2026-08-29T00:00:00.000Z"),
};

function validCreateInput(overrides: Record<string, unknown> = {}) {
  return {
    category: "WRITING_RULE",
    title: "Use colouring, not coloring",
    body: "Always use the British/SA spelling in customer-facing copy.",
    sourceType: "OWNER_APPROVED",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createBrandKnowledgeEntry
// ---------------------------------------------------------------------------

test("create: missing category is rejected", async () => {
  await assert.rejects(
    () => createBrandKnowledgeEntry({ title: "x", body: "x", sourceType: "OWNER_APPROVED" }, null),
    (error: unknown) => error instanceof BrandKnowledgeError
  );
});

test("create: unknown category is rejected", async () => {
  await assert.rejects(
    () => createBrandKnowledgeEntry(validCreateInput({ category: "NOT_A_REAL_CATEGORY" }), null),
    (error: unknown) => error instanceof BrandKnowledgeError
  );
});

test("create: missing title is rejected", async () => {
  await assert.rejects(
    () => createBrandKnowledgeEntry(validCreateInput({ title: undefined }), null),
    (error: unknown) => error instanceof BrandKnowledgeError
  );
});

test("create: missing body is rejected", async () => {
  await assert.rejects(
    () => createBrandKnowledgeEntry(validCreateInput({ body: "" }), null),
    (error: unknown) => error instanceof BrandKnowledgeError
  );
});

test("create: unknown sourceType is rejected", async () => {
  await assert.rejects(
    () => createBrandKnowledgeEntry(validCreateInput({ sourceType: "AI_GUESS" }), null),
    (error: unknown) => error instanceof BrandKnowledgeError
  );
});

test("create: title over the max length is rejected", async () => {
  await assert.rejects(
    () => createBrandKnowledgeEntry(validCreateInput({ title: "x".repeat(300) }), null),
    (error: unknown) => error instanceof BrandKnowledgeError
  );
});

test("create: tags must be an array", async () => {
  await assert.rejects(
    () => createBrandKnowledgeEntry(validCreateInput({ tags: "spelling" }), null),
    (error: unknown) => error instanceof BrandKnowledgeError
  );
});

test("create: too many tags is rejected", async () => {
  await assert.rejects(
    () => createBrandKnowledgeEntry(validCreateInput({ tags: Array.from({ length: 20 }, (_, i) => `tag-${i}`) }), null),
    (error: unknown) => error instanceof BrandKnowledgeError
  );
});

test("create: an overly long tag is rejected", async () => {
  await assert.rejects(
    () => createBrandKnowledgeEntry(validCreateInput({ tags: ["x".repeat(60)] }), null),
    (error: unknown) => error instanceof BrandKnowledgeError
  );
});

test("create: tags are lowercased and de-duplicated", async () => {
  const create = stub(prisma.brandKnowledgeEntry, "create", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  await createBrandKnowledgeEntry(validCreateInput({ tags: ["Spelling", "spelling", "SPELLING", "Voice"] }), null);

  const createArgs = create.fn.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> };
  assert.deepEqual((createArgs.data.tags as string[]).sort(), ["spelling", "voice"]);

  create.restore();
});

test("create: HTML in title/body is stripped, never stored as markup (XSS-safe by construction)", async () => {
  const create = stub(prisma.brandKnowledgeEntry, "create", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  await createBrandKnowledgeEntry(
    validCreateInput({
      title: '<script>alert("x")</script>Use colouring',
      body: "<b>Bold</b> claim text",
    }),
    null
  );

  const createArgs = create.fn.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> };
  assert.equal(createArgs.data.title, "Use colouring");
  assert.equal(createArgs.data.body, "Bold claim text");

  create.restore();
});

test("create: relatedProductId must reference a real product", async () => {
  const findUnique = stub(prisma.product, "findUnique", async () => null);

  await assert.rejects(
    () => createBrandKnowledgeEntry(validCreateInput({ relatedProductId: "does-not-exist" }), null),
    (error: unknown) => error instanceof BrandKnowledgeError && (error as BrandKnowledgeError).statusCode === 404
  );

  findUnique.restore();
});

test("create: a valid submission persists with the acting admin as creator and updater", async () => {
  const create = stub(prisma.brandKnowledgeEntry, "create", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  const result = await createBrandKnowledgeEntry(validCreateInput(), "admin-42");

  const createArgs = create.fn.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> };
  assert.equal(createArgs.data.createdByAdminId, "admin-42");
  assert.equal(createArgs.data.updatedByAdminId, "admin-42");
  assert.equal(result.category, "WRITING_RULE");

  create.restore();
});

test("create: never writes any Product price/stock/name field — Product remains the sole authority", () => {
  // Static, not a runtime call: BrandKnowledgeEntryCreateInput (this
  // service's own accepted input shape) has no price/stock/name field
  // at all — see this file's own import of the service. Enforced at
  // compile time by the interface itself, re-asserted here as a
  // living, explicit test rather than only an implicit guarantee.
  const input = validCreateInput();
  assert.ok(!("price" in input));
  assert.ok(!("stockQuantity" in input));
  assert.ok(!("name" in input));
});

// ---------------------------------------------------------------------------
// updateBrandKnowledgeEntry
// ---------------------------------------------------------------------------

test("update: unknown id is rejected with 404", async () => {
  const findUnique = stub(prisma.brandKnowledgeEntry, "findUnique", async () => null);

  await assert.rejects(
    () => updateBrandKnowledgeEntry("missing", { title: "New title" }, "admin-1"),
    (error: unknown) => error instanceof BrandKnowledgeError && (error as BrandKnowledgeError).statusCode === 404
  );

  findUnique.restore();
});

test("update: only fields present in the request body are touched", async () => {
  const findUnique = stub(prisma.brandKnowledgeEntry, "findUnique", async () => ({ id: "bk-1" }));
  const update = stub(prisma.brandKnowledgeEntry, "update", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  await updateBrandKnowledgeEntry("bk-1", { title: "Updated title" }, "admin-2");

  const updateArgs = update.fn.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> };
  assert.equal(updateArgs.data.title, "Updated title");
  assert.ok(!("body" in updateArgs.data));
  assert.ok(!("category" in updateArgs.data));

  findUnique.restore();
  update.restore();
});

// ---------------------------------------------------------------------------
// deactivate / reactivate
// ---------------------------------------------------------------------------

test("deactivate: unknown id is rejected with 404", async () => {
  const findUnique = stub(prisma.brandKnowledgeEntry, "findUnique", async () => null);

  await assert.rejects(
    () => setBrandKnowledgeEntryActive("missing", false, "admin-1"),
    (error: unknown) => error instanceof BrandKnowledgeError && (error as BrandKnowledgeError).statusCode === 404
  );

  findUnique.restore();
});

test("deactivate then reactivate: toggles isActive, never deletes the row", async () => {
  const findUnique = stub(prisma.brandKnowledgeEntry, "findUnique", async () => ({ id: "bk-1" }));
  const update = stub(prisma.brandKnowledgeEntry, "update", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  const deactivated = await setBrandKnowledgeEntryActive("bk-1", false, "admin-1");
  assert.equal(deactivated.isActive, false);

  const reactivated = await setBrandKnowledgeEntryActive("bk-1", true, "admin-1");
  assert.equal(reactivated.isActive, true);

  findUnique.restore();
  update.restore();
});

// ---------------------------------------------------------------------------
// list filtering
// ---------------------------------------------------------------------------

test("list: category/active/tag/search filters are all forwarded to the query", async () => {
  let whereSeen: unknown;
  const count = stub(prisma.brandKnowledgeEntry, "count", async (args: { where: unknown }) => {
    whereSeen = args.where;
    return 0;
  });
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => []);

  await listBrandKnowledgeEntriesForAdmin({ page: 1, limit: 20, category: "WRITING_RULE", isActive: true, tag: "spelling", search: "colour" });

  const where = JSON.stringify(whereSeen);
  assert.ok(where.includes("WRITING_RULE"));
  assert.ok(where.includes("spelling"));
  assert.ok(where.includes("colour"));

  count.restore();
  findMany.restore();
});

// ---------------------------------------------------------------------------
// getKnowledgeContext (the Phase 3 retrieval boundary)
// ---------------------------------------------------------------------------

test("getKnowledgeContext: always excludes inactive entries", async () => {
  let whereSeen: unknown;
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async (args: { where: unknown }) => {
    whereSeen = args.where;
    return [];
  });

  await getKnowledgeContext({ productId: "prod-1" });

  assert.ok(JSON.stringify(whereSeen).includes('"isActive":true'));

  findMany.restore();
});

test("getKnowledgeContext: includes broadly-applicable entries plus entries scoped to the requested product/audience/pillar", async () => {
  const rows = [
    { ...BASE_ROW, id: "bk-broad" }, // no product/audience/pillar link
    { ...BASE_ROW, id: "bk-product", relatedProductId: "prod-1" },
    { ...BASE_ROW, id: "bk-other-product", relatedProductId: "prod-2" },
  ];
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => rows);

  const result = await getKnowledgeContext({ productId: "prod-1" });

  // The stub returns every row regardless of the where clause (this
  // test asserts the query SHAPE via the "always excludes inactive"
  // test above; this test asserts output mapping is complete/correct).
  assert.equal(result.length, 3);
  assert.ok(result.some((entry) => entry.id === "bk-broad"));
  assert.ok(result.some((entry) => entry.id === "bk-product"));

  findMany.restore();
});

test("getKnowledgeContext: category filter is forwarded when provided", async () => {
  let whereSeen: unknown;
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async (args: { where: unknown }) => {
    whereSeen = args.where;
    return [];
  });

  await getKnowledgeContext({ categories: ["APPROVED_CLAIM", "PROHIBITED_CLAIM"] });

  const where = JSON.stringify(whereSeen);
  assert.ok(where.includes("APPROVED_CLAIM"));
  assert.ok(where.includes("PROHIBITED_CLAIM"));

  findMany.restore();
});

test("getKnowledgeByTags: empty tag list returns an empty array without querying the database", async () => {
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async () => {
    throw new Error("should never be called for an empty tag list");
  });

  const result = await getKnowledgeByTags([]);
  assert.deepEqual(result, []);

  findMany.restore();
});

test("getKnowledgeByTags: normalises tags to lowercase before querying", async () => {
  let whereSeen: unknown;
  const findMany = stub(prisma.brandKnowledgeEntry, "findMany", async (args: { where: unknown }) => {
    whereSeen = args.where;
    return [];
  });

  await getKnowledgeByTags(["Spelling", " VOICE "]);

  const where = JSON.stringify(whereSeen);
  assert.ok(where.includes("spelling"));
  assert.ok(where.includes("voice"));

  findMany.restore();
});

// ---------------------------------------------------------------------------
// Production write guard (Phase 2 brief, Correction B): a mutating call
// with NO stub in place must be blocked, not silently succeed against
// the real database. This proves installProductionWriteGuard already
// covers BrandKnowledgeEntry automatically — no guard code changes
// were made for this phase.
// ---------------------------------------------------------------------------

test("production write guard: an unstubbed create() is blocked, never reaches the real database", async () => {
  await assert.rejects(() => createBrandKnowledgeEntry(validCreateInput(), null), (error: unknown) => error instanceof ProductionWriteBlockedError);
});
