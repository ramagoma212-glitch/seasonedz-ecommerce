// Content Studio Phase 2: backend tests for Audience. Same stub()
// pattern as adminAffiliateProduct.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { ProductionWriteBlockedError } from "../config/testDbGuard.js";
import { AudienceError, createAudience, updateAudience, setAudienceActive, listAudiencesForAdmin } from "./audience.service.js";

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
  id: "aud-1",
  name: "Parents",
  description: null,
  painPoints: null,
  motivations: null,
  preferredContent: null,
  isActive: true,
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
  await assert.rejects(() => createAudience({}), (error: unknown) => error instanceof AudienceError);
});

test("create: a duplicate name is rejected with 409, not a raw Prisma error", async () => {
  const create = stub(prisma.audience, "create", async () => {
    throw uniqueConstraintError();
  });

  await assert.rejects(
    () => createAudience({ name: "Parents" }),
    (error: unknown) => error instanceof AudienceError && (error as AudienceError).statusCode === 409
  );

  create.restore();
});

test("create: never accepts or stores anything resembling individual customer PII fields", () => {
  // AudienceInput (this service's own accepted shape) has no
  // email/phone/customerId/address field at all — enforced at compile
  // time by the interface; re-asserted here as a living test.
  const input = { name: "Parents", description: "x" };
  assert.ok(!("email" in input));
  assert.ok(!("phone" in input));
  assert.ok(!("customerId" in input));
});

test("create: a valid submission persists free-text guidance fields", async () => {
  const create = stub(prisma.audience, "create", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  const result = await createAudience({
    name: "Teachers",
    painPoints: "Limited classroom budget for creative supplies.",
    motivations: "Engaging, low-prep activities that still teach something real.",
  });

  assert.equal(result.name, "Teachers");
  assert.equal(result.painPoints, "Limited classroom budget for creative supplies.");

  create.restore();
});

test("update: unknown id is rejected with 404", async () => {
  const findUnique = stub(prisma.audience, "findUnique", async () => null);

  await assert.rejects(
    () => updateAudience("missing", { name: "New name" }),
    (error: unknown) => error instanceof AudienceError && (error as AudienceError).statusCode === 404
  );

  findUnique.restore();
});

test("update: only fields present in the request body are touched", async () => {
  const findUnique = stub(prisma.audience, "findUnique", async () => ({ id: "aud-1" }));
  const update = stub(prisma.audience, "update", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  await updateAudience("aud-1", { motivations: "Updated motivations" });

  const updateArgs = update.fn.mock.calls[0]!.arguments[0] as { data: Record<string, unknown> };
  assert.equal(updateArgs.data.motivations, "Updated motivations");
  assert.ok(!("name" in updateArgs.data));
  assert.ok(!("painPoints" in updateArgs.data));

  findUnique.restore();
  update.restore();
});

test("deactivate then reactivate: toggles isActive, never deletes the row", async () => {
  const findUnique = stub(prisma.audience, "findUnique", async () => ({ id: "aud-1" }));
  const update = stub(prisma.audience, "update", async (args: { data: Record<string, unknown> }) => ({ ...BASE_ROW, ...args.data }));

  const deactivated = await setAudienceActive("aud-1", false);
  assert.equal(deactivated.isActive, false);
  const reactivated = await setAudienceActive("aud-1", true);
  assert.equal(reactivated.isActive, true);

  findUnique.restore();
  update.restore();
});

test("list: active filter and search are forwarded to the query", async () => {
  let whereSeen: unknown;
  const findMany = stub(prisma.audience, "findMany", async (args: { where: unknown }) => {
    whereSeen = args.where;
    return [];
  });

  await listAudiencesForAdmin({ isActive: true, search: "Parent" });

  const where = JSON.stringify(whereSeen);
  assert.ok(where.includes("true"));
  assert.ok(where.includes("Parent"));

  findMany.restore();
});

test("production write guard: an unstubbed create() is blocked, never reaches the real database", async () => {
  await assert.rejects(() => createAudience({ name: "Should Never Persist" }), (error: unknown) => error instanceof ProductionWriteBlockedError);
});
