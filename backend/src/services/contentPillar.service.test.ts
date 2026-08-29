// Content Studio Phase 2: backend tests for ContentPillar. Same
// stub() pattern as adminAffiliateProduct.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ProductionWriteBlockedError } from "../config/testDbGuard.js";
import { ContentPillarError, createContentPillar, updateContentPillar, setContentPillarActive, listContentPillarsForAdmin } from "./contentPillar.service.js";

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
  id: "pillar-1",
  name: "Educational Colouring",
  description: null,
  isActive: true,
  sortOrder: 0,
  createdAt: new Date("2026-08-29T00:00:00.000Z"),
  updatedAt: new Date("2026-08-29T00:00:00.000Z"),
};

function uniqueConstraintError() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`name`)", {
    code: "P2002",
    clientVersion: "5.22.0",
    meta: { target: ["name"] },
  });
}

test("create: missing name is rejected", async () => {
  await assert.rejects(() => createContentPillar({}), (error: unknown) => error instanceof ContentPillarError);
});

test("create: name over the max length is rejected", async () => {
  await assert.rejects(() => createContentPillar({ name: "x".repeat(200) }), (error: unknown) => error instanceof ContentPillarError);
});

test("create: a duplicate name is rejected with 409, not a raw Prisma error", async () => {
  const create = stub(prisma.contentPillar, "create", async () => {
    throw uniqueConstraintError();
  });

  await assert.rejects(
    () => createContentPillar({ name: "Educational Colouring" }),
    (error: unknown) => error instanceof ContentPillarError && (error as ContentPillarError).statusCode === 409
  );

  create.restore();
});

test("create: a valid submission persists and defaults isActive to true", async () => {
  const create = stub(prisma.contentPillar, "create", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  const result = await createContentPillar({ name: "Bible Learning" });

  assert.equal(result.name, "Bible Learning");
  assert.equal(result.isActive, true);

  create.restore();
});

test("update: unknown id is rejected with 404", async () => {
  const findUnique = stub(prisma.contentPillar, "findUnique", async () => null);

  await assert.rejects(
    () => updateContentPillar("missing", { name: "New name" }),
    (error: unknown) => error instanceof ContentPillarError && (error as ContentPillarError).statusCode === 404
  );

  findUnique.restore();
});

test("update: renaming to an existing pillar's name is rejected with 409", async () => {
  const findUnique = stub(prisma.contentPillar, "findUnique", async () => ({ id: "pillar-1" }));
  const update = stub(prisma.contentPillar, "update", async () => {
    throw uniqueConstraintError();
  });

  await assert.rejects(
    () => updateContentPillar("pillar-1", { name: "Mindfulness" }),
    (error: unknown) => error instanceof ContentPillarError && (error as ContentPillarError).statusCode === 409
  );

  findUnique.restore();
  update.restore();
});

test("deactivate then reactivate: toggles isActive, never deletes the row", async () => {
  const findUnique = stub(prisma.contentPillar, "findUnique", async () => ({ id: "pillar-1" }));
  const update = stub(prisma.contentPillar, "update", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  const deactivated = await setContentPillarActive("pillar-1", false);
  assert.equal(deactivated.isActive, false);
  const reactivated = await setContentPillarActive("pillar-1", true);
  assert.equal(reactivated.isActive, true);

  findUnique.restore();
  update.restore();
});

test("list: active filter and search are forwarded to the query", async () => {
  let whereSeen: unknown;
  const findMany = stub(prisma.contentPillar, "findMany", async (args: { where: unknown }) => {
    whereSeen = args.where;
    return [];
  });

  await listContentPillarsForAdmin({ isActive: true, search: "Bible" });

  const where = JSON.stringify(whereSeen);
  assert.ok(where.includes("true"));
  assert.ok(where.includes("Bible"));

  findMany.restore();
});

test("production write guard: an unstubbed create() is blocked, never reaches the real database", async () => {
  await assert.rejects(() => createContentPillar({ name: "Should Never Persist" }), (error: unknown) => error instanceof ProductionWriteBlockedError);
});
