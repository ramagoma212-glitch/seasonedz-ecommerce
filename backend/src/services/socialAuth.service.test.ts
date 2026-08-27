// Version 7, Milestone 171F: backend tests for the shared social
// sign-in account-linking policy — the milestone brief's own required
// "TESTS — ACCOUNT LINKING" and part of "TESTS — SECURITY" coverage.
// Uses the same stub() Prisma-mock pattern as order.service.test.ts/
// productReview.service.test.ts (Prisma Client's model delegates are
// Proxy objects incompatible with node:test's mock.method()).
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import {
  findOrCreateCustomerForProviderLogin,
  linkProviderToCustomer,
  SocialAuthError,
  unlinkProviderFromCustomer,
  type VerifiedProviderIdentity,
} from "./socialAuth.service.js";

// Unlike order.service.test.ts's stub() (which returns a `restore()`
// each call site must remember to invoke), this variant auto-restores
// every stub after each test via afterEach — with 19 tests in this
// file sharing a handful of Prisma methods, a forgotten manual
// restore() leaves a *previous* test's throwing stub active for a
// later test that touches the same method without re-stubbing it,
// which surfaces as a confusing unhandled rejection rather than a
// clear assertion failure (found exactly this way while writing this
// file — Prisma's array-form `$transaction([prisma.x.create(...), ...])`
// eagerly invokes each operation to build the array, even though the
// mocked $transaction itself never touches them).
let activeStubs: Array<() => void> = [];

afterEach(() => {
  for (const restore of activeStubs) restore();
  activeStubs = [];
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  activeStubs.push(() => {
    obj[key] = original;
  });
  return fn;
}

function identity(overrides: Partial<VerifiedProviderIdentity> = {}): VerifiedProviderIdentity {
  return {
    provider: "GOOGLE",
    providerUserId: "google-sub-123",
    email: "new.customer@example.com",
    firstName: "Thandiwe",
    lastName: "Nkosi",
    profileImageUrl: "https://example.com/avatar.jpg",
    ...overrides,
  };
}

const ACTIVE_CUSTOMER = {
  id: "customer-1",
  email: "new.customer@example.com",
  firstName: "Thandiwe",
  lastName: "Nkosi",
  phone: null,
  type: "REGISTERED",
  passwordHash: null,
  isActive: true,
  profileImageUrl: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

// ---------------------------------------------------------------------------
// New customer creation — one per provider, per the brief's own list
// ---------------------------------------------------------------------------

for (const provider of ["GOOGLE", "FACEBOOK", "APPLE"] as const) {
  test(`a new ${provider} identity (no existing AuthAccount, no existing customer by email) creates exactly one customer`, async () => {
    stub(prisma.authAccount, "findUnique", async () => null);
    stub(prisma.customer, "findUnique", async () => null);
    const createCall = stub(prisma.customer, "create", async (args: { data: Record<string, unknown> }) => ({
      ...ACTIVE_CUSTOMER,
      id: `new-${provider.toLowerCase()}-customer`,
      email: args.data.email,
    }));

    const result = await findOrCreateCustomerForProviderLogin(identity({ provider, providerUserId: `${provider}-sub-1` }));

    assert.equal(result.isNewCustomer, true);
    assert.equal(createCall.mock.callCount(), 1);
    const createArgs = createCall.mock.calls[0]!.arguments[0] as { data: { authAccounts: { create: { provider: string; providerUserId: string } } } };
    assert.equal(createArgs.data.authAccounts.create.provider, provider);
    assert.equal(createArgs.data.authAccounts.create.providerUserId, `${provider}-sub-1`);
  });

  test(`a returning ${provider} identity (existing AuthAccount found) logs into the same customer — never creates a second one`, async () => {
    stub(prisma.authAccount, "findUnique", async () => ({
      id: "auth-account-1",
      provider,
      providerUserId: "existing-sub",
      customerId: ACTIVE_CUSTOMER.id,
      customer: ACTIVE_CUSTOMER,
    }));
    const updateCall = stub(prisma.customer, "update", async () => ACTIVE_CUSTOMER);
    const createCall = stub(prisma.customer, "create", async () => {
      throw new Error("must never be called — a returning identity must never create a second customer");
    });

    const result = await findOrCreateCustomerForProviderLogin(identity({ provider, providerUserId: "existing-sub" }));

    assert.equal(result.isNewCustomer, false);
    assert.equal(result.customer.id, ACTIVE_CUSTOMER.id);
    assert.equal(createCall.mock.callCount(), 0);
    assert.equal(updateCall.mock.callCount(), 1);
  });
}

// ---------------------------------------------------------------------------
// Duplicate-account / auto-link protection
// ---------------------------------------------------------------------------

test("existing password account + same Google email does NOT silently create a duplicate customer", async () => {
  stub(prisma.authAccount, "findUnique", async () => null);
  stub(prisma.customer, "findUnique", async () => ({ ...ACTIVE_CUSTOMER, passwordHash: "bcrypt-hash-of-a-real-password" }));
  const createCall = stub(prisma.customer, "create", async () => {
    throw new Error("must never be called");
  });

  await assert.rejects(
    () => findOrCreateCustomerForProviderLogin(identity()),
    (error: unknown) => error instanceof SocialAuthError && error.code === "ACCOUNT_EXISTS"
  );
  assert.equal(createCall.mock.callCount(), 0);
});

test("existing password account + same Google email does NOT silently auto-link the provider", async () => {
  stub(prisma.authAccount, "findUnique", async () => null);
  stub(prisma.customer, "findUnique", async () => ({ ...ACTIVE_CUSTOMER, passwordHash: "bcrypt-hash" }));
  const authAccountCreate = stub(prisma.authAccount, "create", async () => {
    throw new Error("must never be called — email match alone must never auto-link");
  });

  await assert.rejects(() => findOrCreateCustomerForProviderLogin(identity()), SocialAuthError);
  assert.equal(authAccountCreate.mock.callCount(), 0);
});

test("duplicate provider callback (the exact same identity handled twice) cannot create a duplicate customer", async () => {
  // First call: no AuthAccount yet -> creates a customer.
  let authAccountExists: { id: string; provider: string; providerUserId: string; customerId: string; customer: typeof ACTIVE_CUSTOMER } | null = null;
  stub(prisma.authAccount, "findUnique", async () => authAccountExists);
  stub(prisma.customer, "findUnique", async () => null);
  stub(prisma.customer, "create", async () => {
    authAccountExists = { id: "auth-1", provider: "GOOGLE", providerUserId: "dup-sub", customerId: ACTIVE_CUSTOMER.id, customer: ACTIVE_CUSTOMER };
    return ACTIVE_CUSTOMER;
  });
  stub(prisma.customer, "update", async () => ACTIVE_CUSTOMER);

  const first = await findOrCreateCustomerForProviderLogin(identity({ providerUserId: "dup-sub" }));
  assert.equal(first.isNewCustomer, true);

  // A second, duplicated callback for the exact same provider identity
  // (e.g. a double-submitted redirect) — must find the AuthAccount this
  // time and log into the same customer, never create another one.
  const second = await findOrCreateCustomerForProviderLogin(identity({ providerUserId: "dup-sub" }));
  assert.equal(second.isNewCustomer, false);
  assert.equal(second.customer.id, first.customer.id);
});

// ---------------------------------------------------------------------------
// Disabled account
// ---------------------------------------------------------------------------

test("a disabled customer cannot bypass account-disabled status via OAuth", async () => {
  stub(prisma.authAccount, "findUnique", async () => ({
    id: "auth-1",
    provider: "GOOGLE",
    providerUserId: "disabled-sub",
    customerId: "disabled-customer",
    customer: { ...ACTIVE_CUSTOMER, id: "disabled-customer", isActive: false },
  }));
  const updateCall = stub(prisma.customer, "update", async () => {
    throw new Error("must never be called — a disabled account must be rejected before any update");
  });

  await assert.rejects(
    () => findOrCreateCustomerForProviderLogin(identity({ providerUserId: "disabled-sub" })),
    (error: unknown) => error instanceof SocialAuthError && error.code === "ACCOUNT_DISABLED"
  );
  assert.equal(updateCall.mock.callCount(), 0);
});

// ---------------------------------------------------------------------------
// Apple-specific: relay email, missing repeated name
// ---------------------------------------------------------------------------

test("an Apple private-relay email is accepted the same as any other email — a new customer is created", async () => {
  stub(prisma.authAccount, "findUnique", async () => null);
  stub(prisma.customer, "findUnique", async () => null);
  const createCall = stub(prisma.customer, "create", async (args: { data: { email: string } }) => ({ ...ACTIVE_CUSTOMER, email: args.data.email }));

  const result = await findOrCreateCustomerForProviderLogin(
    identity({ provider: "APPLE", providerUserId: "apple-sub-1", email: "abc123xyz@privaterelay.appleid.com" })
  );

  assert.equal(result.isNewCustomer, true);
  assert.equal(createCall.mock.callCount(), 1);
});

test("Apple not repeating the name on a later login never overwrites the customer's already-stored name", async () => {
  stub(prisma.authAccount, "findUnique", async () => ({
    id: "auth-1",
    provider: "APPLE",
    providerUserId: "apple-returning",
    customerId: ACTIVE_CUSTOMER.id,
    customer: ACTIVE_CUSTOMER,
  }));
  const updateCall = stub(prisma.customer, "update", async (args: { data: Record<string, unknown> }) => {
    assert.ok(!("firstName" in args.data), "a returning login must never touch firstName");
    assert.ok(!("lastName" in args.data), "a returning login must never touch lastName");
    return ACTIVE_CUSTOMER;
  });

  // Apple sends no `user` field on this (non-first) authorization —
  // exactly what appleOAuth.service.ts's exchangeAppleCallback()
  // produces when the POST body has no `user` field: null names.
  await findOrCreateCustomerForProviderLogin(
    identity({ provider: "APPLE", providerUserId: "apple-returning", firstName: null, lastName: null })
  );

  assert.equal(updateCall.mock.callCount(), 1);
});

// ---------------------------------------------------------------------------
// Linking a provider to an already-authenticated customer
// ---------------------------------------------------------------------------

test("an authenticated customer can securely link a new provider identity", async () => {
  stub(prisma.authAccount, "findUnique", async () => null);
  // Array-style transaction (prisma.$transaction([...])): the array
  // elements are built by calling prisma.authAccount.create()/
  // prisma.customer.update() BEFORE $transaction() itself ever runs —
  // both must be stubbed too, or the real (unstubbed) calls reach the
  // actual database. This test previously only stubbed $transaction
  // itself (which just echoes back whatever array it's given, never
  // inspecting how it was built) and silently made two real writes to
  // production on every run — caught by Milestone 174C's new
  // testDbGuard.ts.
  stub(prisma.authAccount, "create", async () => ({ id: "auth-1" }));
  stub(prisma.customer, "update", async () => ({ id: "customer-1" }));
  const transactionCall = stub(prisma, "$transaction", async (operations: unknown[]) => operations);

  await linkProviderToCustomer("customer-1", identity({ provider: "FACEBOOK", providerUserId: "fb-sub-1" }));

  assert.equal(transactionCall.mock.callCount(), 1);
});

test("linking is idempotent: the provider identity already belongs to THIS customer -> no-op, not an error", async () => {
  stub(prisma.authAccount, "findUnique", async () => ({ id: "auth-1", provider: "FACEBOOK", providerUserId: "fb-sub-1", customerId: "customer-1" }));
  const transactionCall = stub(prisma, "$transaction", async () => {
    throw new Error("must never be called for an already-linked identity");
  });

  await linkProviderToCustomer("customer-1", identity({ provider: "FACEBOOK", providerUserId: "fb-sub-1" }));

  assert.equal(transactionCall.mock.callCount(), 0);
});

test("a provider identity cannot belong to two customers — linking to a different customer than the one it's already attached to is rejected", async () => {
  stub(prisma.authAccount, "findUnique", async () => ({ id: "auth-1", provider: "FACEBOOK", providerUserId: "fb-sub-1", customerId: "customer-OTHER" }));
  const transactionCall = stub(prisma, "$transaction", async () => {
    throw new Error("must never be called");
  });

  await assert.rejects(
    () => linkProviderToCustomer("customer-1", identity({ provider: "FACEBOOK", providerUserId: "fb-sub-1" })),
    (error: unknown) => error instanceof SocialAuthError && error.code === "PROVIDER_ALREADY_LINKED_ELSEWHERE"
  );
  assert.equal(transactionCall.mock.callCount(), 0);
});

// ---------------------------------------------------------------------------
// Disconnecting a provider — never leave zero usable sign-in methods
// ---------------------------------------------------------------------------

test("disconnecting the only sign-in method (no password, one connected provider) is rejected", async () => {
  stub(prisma.customer, "findUnique", async () => ({ passwordHash: null, authAccounts: [{ provider: "GOOGLE" }] }));
  const deleteCall = stub(prisma.authAccount, "deleteMany", async () => {
    throw new Error("must never be called");
  });

  await assert.rejects(
    () => unlinkProviderFromCustomer("customer-1", "GOOGLE"),
    (error: unknown) => error instanceof SocialAuthError && error.code === "LAST_LOGIN_METHOD"
  );
  assert.equal(deleteCall.mock.callCount(), 0);
});

test("disconnecting one of two connected providers (no password) succeeds", async () => {
  stub(prisma.customer, "findUnique", async () => ({ passwordHash: null, authAccounts: [{ provider: "GOOGLE" }, { provider: "FACEBOOK" }] }));
  const deleteCall = stub(prisma.authAccount, "deleteMany", async () => ({ count: 1 }));

  await unlinkProviderFromCustomer("customer-1", "GOOGLE");

  assert.equal(deleteCall.mock.callCount(), 1);
});

test("disconnecting a provider when a password also exists succeeds even if it's the only provider", async () => {
  stub(prisma.customer, "findUnique", async () => ({ passwordHash: "bcrypt-hash", authAccounts: [{ provider: "GOOGLE" }] }));
  const deleteCall = stub(prisma.authAccount, "deleteMany", async () => ({ count: 1 }));

  await unlinkProviderFromCustomer("customer-1", "GOOGLE");

  assert.equal(deleteCall.mock.callCount(), 1);
});
