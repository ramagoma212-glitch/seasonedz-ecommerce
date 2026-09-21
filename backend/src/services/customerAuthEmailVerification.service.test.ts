// Milestone 189: dedicated tests for customerAuth.service.ts's new
// email-verification functions — createEmailVerificationToken() and
// verifyCustomerEmail(). Kept as its own file (not merged into a
// general customerAuth.service.test.ts, which doesn't exist yet) so
// this milestone's test additions are easy to find, same reasoning as
// digitalDownload.service.test.ts's own scoping to its milestone.
// Same stub()-based Prisma mocking approach — see that file's header
// comment for why.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prisma } from "../config/prisma.js";
import { createEmailVerificationToken, verifyCustomerEmail, CustomerAuthError } from "./customerAuth.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

test("createEmailVerificationToken: stores only the SHA-256 hash, never the raw token", async () => {
  let capturedData: any = null;
  const customerUpdate = stub(prisma.customer, "update", async (args: any) => {
    capturedData = args.data;
    return {};
  });

  const rawToken = await createEmailVerificationToken("cust-1");

  assert.equal(capturedData.emailVerificationTokenHash, createHash("sha256").update(rawToken).digest("hex"));
  assert.notEqual(capturedData.emailVerificationTokenHash, rawToken);
  assert.ok(capturedData.emailVerificationExpiresAt instanceof Date);
  customerUpdate.restore();
});

test("verifyCustomerEmail: an unknown/invalid/expired token throws a single generic CustomerAuthError", async () => {
  const customerFindFirst = stub(prisma.customer, "findFirst", async () => null);

  await assert.rejects(() => verifyCustomerEmail("not-a-real-token"), (error: unknown) => {
    assert.ok(error instanceof CustomerAuthError);
    assert.equal((error as CustomerAuthError).message, "This verification link is invalid or has expired.");
    return true;
  });

  customerFindFirst.restore();
});

test("verifyCustomerEmail: a genuinely first-time verification sets emailVerifiedAt, clears the token, reports firstTimeVerified: true", async () => {
  const customerFindFirst = stub(prisma.customer, "findFirst", async () => ({ id: "cust-1", emailVerifiedAt: null }));
  const updateMany = stub(prisma.customer, "updateMany", async (args: any) => {
    assert.equal(args.where.id, "cust-1");
    assert.equal(args.where.emailVerifiedAt, null); // the conditional-update atomicity guard
    assert.ok(args.data.emailVerifiedAt instanceof Date);
    assert.equal(args.data.emailVerificationTokenHash, null);
    return { count: 1 };
  });
  const findUniqueOrThrow = stub(prisma.customer, "findUniqueOrThrow", async () => ({
    id: "cust-1",
    email: "jane@example.com",
    firstName: "Jane",
    lastName: "Doe",
    phone: null,
    type: "REGISTERED",
    profileImageUrl: null,
    createdAt: new Date(),
  }));

  const result = await verifyCustomerEmail("a-valid-raw-token");

  assert.equal(result.firstTimeVerified, true);
  assert.equal(result.customer.id, "cust-1");

  customerFindFirst.restore();
  updateMany.restore();
  findUniqueOrThrow.restore();
});

test("verifyCustomerEmail: losing the conditional-update race (a concurrent call already verified) reports firstTimeVerified: false, never re-marks anything", async () => {
  const customerFindFirst = stub(prisma.customer, "findFirst", async () => ({ id: "cust-1", emailVerifiedAt: null }));
  const updateMany = stub(prisma.customer, "updateMany", async () => ({ count: 0 }));
  const findUniqueOrThrow = stub(prisma.customer, "findUniqueOrThrow", async () => ({
    id: "cust-1",
    email: "jane@example.com",
    firstName: "Jane",
    lastName: "Doe",
    phone: null,
    type: "REGISTERED",
    profileImageUrl: null,
    createdAt: new Date(),
  }));

  const result = await verifyCustomerEmail("a-valid-raw-token");

  assert.equal(result.firstTimeVerified, false);

  customerFindFirst.restore();
  updateMany.restore();
  findUniqueOrThrow.restore();
});

test("verifyCustomerEmail: looks up by the hash of the token, never a raw stored token", async () => {
  let capturedWhere: any = null;
  const customerFindFirst = stub(prisma.customer, "findFirst", async (args: any) => {
    capturedWhere = args.where;
    return null;
  });

  await assert.rejects(() => verifyCustomerEmail("plain-raw-token-value"));

  assert.equal(capturedWhere.emailVerificationTokenHash, createHash("sha256").update("plain-raw-token-value").digest("hex"));
  assert.notEqual(capturedWhere.emailVerificationTokenHash, "plain-raw-token-value");
  customerFindFirst.restore();
});
