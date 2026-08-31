// Milestone 179, Part C: admin email OTP two-factor authentication.
// Security-critical — covers the full challenge lifecycle (issue,
// resend cooldown, verify success/failure/replay/attempt-limit) since
// this is the one control standing between a correct password and a
// created session (brief section 8).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prisma } from "../config/prisma.js";
import {
  AdminOtpError,
  findAdminIdForChallengeToken,
  issueOtpChallenge,
  maskEmailForDisplay,
  secondsUntilOtpResendAllowed,
  verifyOtpChallenge,
} from "./adminOtp.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function hashValue(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

test("issueOtpChallenge: returns a 6-digit numeric code and a distinct high-entropy challenge token", async () => {
  const updateMany = stub(prisma.adminOtpChallenge, "updateMany", async () => ({ count: 0 }));
  const create = stub(prisma.adminOtpChallenge, "create", async (args: { data: Record<string, unknown> }) => ({ id: "challenge-1", ...args.data }));
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));

  const result = await issueOtpChallenge("admin-1");

  assert.match(result.code, /^\d{6}$/);
  assert.ok(result.rawChallengeToken.length >= 32);
  assert.notEqual(result.code, result.rawChallengeToken);
  assert.ok(result.expiresAt.getTime() > Date.now());

  updateMany.restore();
  create.restore();
  transactionStub.restore();
});

test("issueOtpChallenge: invalidates any still-active challenge for the same admin before issuing a new one", async () => {
  const updateMany = stub(prisma.adminOtpChallenge, "updateMany", async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.adminUserId, "admin-1");
    assert.equal(args.where.usedAt, null);
    return { count: 1 };
  });
  const create = stub(prisma.adminOtpChallenge, "create", async (args: { data: Record<string, unknown> }) => ({ id: "challenge-2", ...args.data }));
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));

  await issueOtpChallenge("admin-1");
  assert.equal(updateMany.fn.mock.callCount(), 1);

  updateMany.restore();
  create.restore();
  transactionStub.restore();
});

test("issueOtpChallenge: never returns or stores the code in plaintext — only its hash is persisted", async () => {
  const updateMany = stub(prisma.adminOtpChallenge, "updateMany", async () => ({ count: 0 }));
  let persistedData: Record<string, unknown> = {};
  const create = stub(prisma.adminOtpChallenge, "create", async (args: { data: Record<string, unknown> }) => {
    persistedData = args.data;
    return { id: "challenge-1", ...args.data };
  });
  const transactionStub = stub(prisma, "$transaction", async (callback: (tx: typeof prisma) => unknown) => callback(prisma));

  const result = await issueOtpChallenge("admin-1");

  assert.equal(persistedData.codeHash, hashValue(result.code));
  assert.notEqual(persistedData.codeHash, result.code);

  updateMany.restore();
  create.restore();
  transactionStub.restore();
});

test("secondsUntilOtpResendAllowed: null (allowed now) when no prior challenge exists", async () => {
  const findFirst = stub(prisma.adminOtpChallenge, "findFirst", async () => null);
  assert.equal(await secondsUntilOtpResendAllowed("admin-1"), null);
  findFirst.restore();
});

test("secondsUntilOtpResendAllowed: returns remaining seconds within the 60 second cooldown", async () => {
  const findFirst = stub(prisma.adminOtpChallenge, "findFirst", async () => ({ createdAt: new Date(Date.now() - 10_000) }));
  const remaining = await secondsUntilOtpResendAllowed("admin-1");
  assert.ok(remaining !== null && remaining > 0 && remaining <= 50);
  findFirst.restore();
});

test("secondsUntilOtpResendAllowed: null (allowed now) once the cooldown has fully elapsed", async () => {
  const findFirst = stub(prisma.adminOtpChallenge, "findFirst", async () => ({ createdAt: new Date(Date.now() - 61_000) }));
  assert.equal(await secondsUntilOtpResendAllowed("admin-1"), null);
  findFirst.restore();
});

function challengeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "challenge-1",
    adminUserId: "admin-1",
    challengeTokenHash: hashValue("raw-challenge-token"),
    codeHash: hashValue("123456"),
    expiresAt: new Date(Date.now() + 60_000),
    attemptCount: 0,
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

test("verifyOtpChallenge: unknown challenge token is rejected", async () => {
  const findUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => null);
  await assert.rejects(() => verifyOtpChallenge("unknown-token", "123456"), AdminOtpError);
  findUnique.restore();
});

test("verifyOtpChallenge: an already-used challenge is rejected — replay is never possible even with the correct code", async () => {
  const findUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => challengeRow({ usedAt: new Date() }));
  await assert.rejects(() => verifyOtpChallenge("raw-challenge-token", "123456"), AdminOtpError);
  findUnique.restore();
});

test("verifyOtpChallenge: an expired challenge is rejected even with the correct code", async () => {
  const findUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => challengeRow({ expiresAt: new Date(Date.now() - 1000) }));
  await assert.rejects(() => verifyOtpChallenge("raw-challenge-token", "123456"), AdminOtpError);
  findUnique.restore();
});

test("verifyOtpChallenge: a challenge already at the attempt limit is rejected without even checking the code", async () => {
  const findUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => challengeRow({ attemptCount: 5 }));
  const update = stub(prisma.adminOtpChallenge, "update", async () => {
    throw new Error("must never be called — attempt limit already reached");
  });
  await assert.rejects(() => verifyOtpChallenge("raw-challenge-token", "123456"), AdminOtpError);
  update.restore();
  findUnique.restore();
});

test("verifyOtpChallenge: a wrong code increments attemptCount and is rejected", async () => {
  const findUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => challengeRow({ attemptCount: 1 }));
  const update = stub(prisma.adminOtpChallenge, "update", async (args: { data: Record<string, unknown> }) => {
    assert.deepEqual(args.data, { attemptCount: { increment: 1 } });
    return challengeRow({ attemptCount: 2 });
  });

  await assert.rejects(() => verifyOtpChallenge("raw-challenge-token", "000000"), AdminOtpError);
  assert.equal(update.fn.mock.callCount(), 1);

  update.restore();
  findUnique.restore();
});

test("verifyOtpChallenge: the 5th wrong attempt is rejected with the same too-many-attempts message, not a generic wrong-code message", async () => {
  const findUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => challengeRow({ attemptCount: 4 }));
  const update = stub(prisma.adminOtpChallenge, "update", async () => challengeRow({ attemptCount: 5 }));

  await assert.rejects(
    () => verifyOtpChallenge("raw-challenge-token", "000000"),
    (error: unknown) => error instanceof AdminOtpError && error.statusCode === 429
  );

  update.restore();
  findUnique.restore();
});

test("verifyOtpChallenge: the correct code marks the challenge used and returns the admin id", async () => {
  const findUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => challengeRow());
  const update = stub(prisma.adminOtpChallenge, "update", async (args: { data: Record<string, unknown> }) => {
    assert.ok((args.data.usedAt as Date) instanceof Date);
    return challengeRow({ usedAt: new Date() });
  });

  const result = await verifyOtpChallenge("raw-challenge-token", "123456");
  assert.equal(result.adminUserId, "admin-1");
  assert.equal(update.fn.mock.callCount(), 1);

  update.restore();
  findUnique.restore();
});

test("findAdminIdForChallengeToken: resolves a known token without consuming an attempt or requiring a code", async () => {
  const findUnique = stub(prisma.adminOtpChallenge, "findUnique", async (args: { where: Record<string, unknown> }) => {
    assert.equal(args.where.challengeTokenHash, hashValue("raw-challenge-token"));
    return { adminUserId: "admin-1" };
  });
  assert.equal(await findAdminIdForChallengeToken("raw-challenge-token"), "admin-1");
  findUnique.restore();
});

test("findAdminIdForChallengeToken: unknown token resolves to null", async () => {
  const findUnique = stub(prisma.adminOtpChallenge, "findUnique", async () => null);
  assert.equal(await findAdminIdForChallengeToken("unknown-token"), null);
  findUnique.restore();
});

test("maskEmailForDisplay: never reveals the full local part of the address", () => {
  const masked = maskEmailForDisplay("ndamulelo@example.com");
  assert.ok(masked.startsWith("n"));
  assert.ok(masked.includes("@example.com"));
  assert.ok(!masked.includes("damulelo"));
});
