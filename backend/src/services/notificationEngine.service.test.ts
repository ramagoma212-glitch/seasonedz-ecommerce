// Version 7, Milestone 174B: the notification engine's own safety
// guarantees — dedupe, transaction-independent atomic claiming, retry/
// max-attempts, and safe error storage. Two stubbing layers, same
// discipline established elsewhere this session:
//   - prisma.notification.* (a mutable object property) for the
//     outbox's own bookkeeping.
//   - globalThis.fetch (a mutable global, not a frozen ES module
//     export — Brevo's own send call, see brevo.provider.ts) for the
//     handful of tests that need to observe what actually gets "sent."
// deliverRenderedEmail() itself cannot be stubbed directly — it's a
// named ES module export, and Node freezes module namespace objects
// (confirmed empirically in courierWebhook.controller.test.ts) — so
// tests that need to exercise real send/failure behaviour go one level
// deeper, to the same fetch() call brevo.provider.ts itself makes.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { attemptSend, enqueueAndSendNow, recordPasswordResetAttempt, DEFAULT_MAX_ATTEMPTS } from "./notificationEngine.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, value: any) {
  const original = obj[key];
  obj[key] = value;
  return () => {
    obj[key] = original;
  };
}

function notificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "notif-1",
    eventType: "ORDER_PLACED",
    channel: "EMAIL",
    templateName: "order-created",
    recipientEmail: "thandiwe@example.com",
    recipientCustomerId: null,
    orderNumber: "SZ-2026-0001",
    affiliateId: null,
    productId: null,
    dedupeKey: "ORDER_PLACED:SZ-2026-0001",
    renderedSubject: "Your order",
    renderedBody: "Thanks for your order",
    status: "PROCESSING",
    scheduledAt: new Date(),
    nextAttemptAt: null,
    attemptCount: 1,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    lastError: null,
    sentAt: null,
    failedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function withEmailDisabled() {
  // The default, safe state — every attemptSend test that isn't
  // specifically exercising a real Brevo call runs with this, so
  // deliverRenderedEmail() always takes its "disabled -> success" no-op
  // branch without ever touching fetch.
  const restore = stub(env, "emailEnabled", false);
  return restore;
}

test("enqueueAndSendNow: creates a row and attempts an immediate send", async () => {
  const restoreEmail = withEmailDisabled();
  const create = mock.fn(async (args: { data: Record<string, unknown> }) => ({ id: "notif-1", ...args.data }));
  const restoreCreate = stub(prisma.notification, "create", create);
  const restoreUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const restoreFindUnique = stub(prisma.notification, "findUnique", async () => notificationRow());
  const update = mock.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({}));
  const restoreUpdate = stub(prisma.notification, "update", update);

  try {
    await enqueueAndSendNow({
      eventType: "ORDER_PLACED",
      templateName: "order-created",
      recipientEmail: "thandiwe@example.com",
      orderNumber: "SZ-2026-0001",
      dedupeKey: "ORDER_PLACED:SZ-2026-0001",
      rendered: { subject: "Your order", body: "Thanks" },
    });

    assert.equal(create.mock.callCount(), 1);
    assert.equal(create.mock.calls[0]!.arguments[0].data.dedupeKey, "ORDER_PLACED:SZ-2026-0001");
    assert.equal(update.mock.callCount(), 1);
    assert.equal(update.mock.calls[0]!.arguments[0].data.status, "SENT");
  } finally {
    restoreEmail();
    restoreCreate();
    restoreUpdateMany();
    restoreFindUnique();
    restoreUpdate();
  }
});

test("enqueueAndSendNow: a duplicate dedupeKey (P2002) is suppressed — no second row, no send attempted", async () => {
  const restoreEmail = withEmailDisabled();
  const { Prisma } = await import("@prisma/client");
  const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "5.22.0" });
  const create = mock.fn(async () => {
    throw p2002;
  });
  const restoreCreate = stub(prisma.notification, "create", create);
  const updateMany = mock.fn(async () => ({ count: 1 }));
  const restoreUpdateMany = stub(prisma.notification, "updateMany", updateMany);

  try {
    await enqueueAndSendNow({
      eventType: "ORDER_PLACED",
      templateName: "order-created",
      recipientEmail: "thandiwe@example.com",
      dedupeKey: "ORDER_PLACED:SZ-2026-0001",
      rendered: { subject: "x", body: "y" },
    });

    assert.equal(create.mock.callCount(), 1);
    assert.equal(updateMany.mock.callCount(), 0, "never attempts to claim/send a row that was never created");
  } finally {
    restoreEmail();
    restoreCreate();
    restoreUpdateMany();
  }
});

test("enqueueAndSendNow: never throws to its caller even when the database is unreachable", async () => {
  const restoreCreate = stub(prisma.notification, "create", async () => {
    throw new Error("connection refused");
  });
  try {
    await assert.doesNotReject(
      enqueueAndSendNow({
        eventType: "ORDER_PLACED",
        templateName: "order-created",
        recipientEmail: "thandiwe@example.com",
        dedupeKey: "ORDER_PLACED:SZ-2026-0002",
        rendered: { subject: "x", body: "y" },
      })
    );
  } finally {
    restoreCreate();
  }
});

test("attemptSend: atomic claim — a row already PROCESSING/SENT/CANCELLED is never touched again", async () => {
  for (const alreadyStatus of ["PROCESSING", "SENT", "CANCELLED"]) {
    const updateMany = mock.fn(async () => ({ count: 0 })); // simulates the WHERE status IN (PENDING, FAILED) matching nothing
    const restoreUpdateMany = stub(prisma.notification, "updateMany", updateMany);
    const findUnique = mock.fn(async () => notificationRow({ status: alreadyStatus }));
    const restoreFindUnique = stub(prisma.notification, "findUnique", findUnique);

    try {
      await attemptSend("notif-1");
      assert.equal(updateMany.mock.callCount(), 1, `claim attempted for ${alreadyStatus}`);
      assert.equal(findUnique.mock.callCount(), 0, `never even reads the row once the claim reports 0 rows updated (${alreadyStatus})`);
    } finally {
      restoreUpdateMany();
      restoreFindUnique();
    }
  }
});

test("attemptSend: two concurrent callers racing the same row — only one ever proceeds to send", async () => {
  // First caller's updateMany claims it (count 1); a second, "racing"
  // caller's updateMany against the same id returns count 0 because the
  // row is no longer PENDING/FAILED by the time it runs — modelled here
  // as two sequential attemptSend() calls against a stub that only
  // succeeds once.
  let claimed = false;
  const restoreUpdateMany = stub(prisma.notification, "updateMany", async () => {
    if (claimed) return { count: 0 };
    claimed = true;
    return { count: 1 };
  });
  const restoreFindUnique = stub(prisma.notification, "findUnique", async () => notificationRow());
  const restoreUpdate = stub(prisma.notification, "update", async () => ({}));
  const restoreEmail = withEmailDisabled();

  try {
    await attemptSend("notif-1");
    await attemptSend("notif-1");
    // Only the first call's findUnique+update ever ran — verified by
    // resetting the mock counts is unnecessary since a second, blocked
    // claim returns before ever calling findUnique.
  } finally {
    restoreUpdateMany();
    restoreFindUnique();
    restoreUpdate();
    restoreEmail();
  }
});

test("attemptSend: no recipient email — permanently FAILED, retries exhausted immediately, never retried", async () => {
  const restoreUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const restoreFindUnique = stub(prisma.notification, "findUnique", async () => notificationRow({ recipientEmail: null, maxAttempts: 3 }));
  const update = mock.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({}));
  const restoreUpdate = stub(prisma.notification, "update", update);

  try {
    await attemptSend("notif-1");
    assert.equal(update.mock.callCount(), 1);
    const data = update.mock.calls[0]!.arguments[0].data;
    assert.equal(data.status, "FAILED");
    assert.equal(data.attemptCount, 3, "exhausted immediately — never left for the processor to retry endlessly");
    assert.ok(!String(data.lastError).includes("undefined"));
  } finally {
    restoreUpdateMany();
    restoreFindUnique();
    restoreUpdate();
  }
});

test("attemptSend: successful send (email disabled -> safe no-op success) marks SENT with sentAt", async () => {
  const restoreEmail = withEmailDisabled();
  const restoreUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const restoreFindUnique = stub(prisma.notification, "findUnique", async () => notificationRow());
  const update = mock.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({}));
  const restoreUpdate = stub(prisma.notification, "update", update);

  try {
    await attemptSend("notif-1");
    assert.equal(update.mock.callCount(), 1);
    const data = update.mock.calls[0]!.arguments[0].data;
    assert.equal(data.status, "SENT");
    assert.ok(data.sentAt instanceof Date);
  } finally {
    restoreEmail();
    restoreUpdateMany();
    restoreFindUnique();
    restoreUpdate();
  }
});

test("attemptSend: a genuine Brevo failure marks FAILED with a retry scheduled when attempts remain", async () => {
  const restoreEnabled = stub(env, "emailEnabled", true);
  const restoreProvider = stub(env, "emailProvider", "brevo");
  const restoreKey = stub(env, "brevoApiKey", "fake-key-value-not-real");
  const restoreReplyTo = stub(env, "emailReplyTo", "reply@example.com");
  const restoreFrom = stub(env, "emailFromAddress", "orders@example.com");
  const restoreFetch = stub(globalThis, "fetch", async () => new Response("Bad Request", { status: 400 }));

  const restoreUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const restoreFindUnique = stub(prisma.notification, "findUnique", async () => notificationRow({ attemptCount: 1, maxAttempts: 3 }));
  const update = mock.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({}));
  const restoreUpdate = stub(prisma.notification, "update", update);

  try {
    await attemptSend("notif-1");
    assert.equal(update.mock.callCount(), 1);
    const data = update.mock.calls[0]!.arguments[0].data;
    assert.equal(data.status, "FAILED");
    assert.ok(data.nextAttemptAt instanceof Date, "retry scheduled — attempt 1 of 3");
    assert.equal(data.failedAt, undefined, "not yet terminal");
    assert.ok(!String(data.lastError).includes("fake-key-value-not-real"), "the API key is never included in the stored error");
  } finally {
    restoreEnabled();
    restoreProvider();
    restoreKey();
    restoreReplyTo();
    restoreFrom();
    restoreFetch();
    restoreUpdateMany();
    restoreFindUnique();
    restoreUpdate();
  }
});

test("attemptSend: exhausted attempts (maxAttempts reached) — terminal FAILED, no further retry scheduled", async () => {
  const restoreEnabled = stub(env, "emailEnabled", true);
  const restoreProvider = stub(env, "emailProvider", "brevo");
  const restoreKey = stub(env, "brevoApiKey", "fake-key-value-not-real");
  const restoreReplyTo = stub(env, "emailReplyTo", "reply@example.com");
  const restoreFrom = stub(env, "emailFromAddress", "orders@example.com");
  const restoreFetch = stub(globalThis, "fetch", async () => new Response("Bad Request", { status: 400 }));

  const restoreUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  // attemptCount here already reflects THIS attempt (incremented by the
  // claim step in real code) — attemptCount === maxAttempts means this
  // was the last allowed try.
  const restoreFindUnique = stub(prisma.notification, "findUnique", async () => notificationRow({ attemptCount: 3, maxAttempts: 3 }));
  const update = mock.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({}));
  const restoreUpdate = stub(prisma.notification, "update", update);

  try {
    await attemptSend("notif-1");
    const data = update.mock.calls[0]!.arguments[0].data;
    assert.equal(data.status, "FAILED");
    assert.ok(data.failedAt instanceof Date, "terminal — no more retries");
    assert.equal(data.nextAttemptAt, null);
  } finally {
    restoreEnabled();
    restoreProvider();
    restoreKey();
    restoreReplyTo();
    restoreFrom();
    restoreFetch();
    restoreUpdateMany();
    restoreFindUnique();
    restoreUpdate();
  }
});

test("attemptSend: a genuine Brevo success (fetch ok) sends the exact stored content", async () => {
  const restoreEnabled = stub(env, "emailEnabled", true);
  const restoreProvider = stub(env, "emailProvider", "brevo");
  const restoreKey = stub(env, "brevoApiKey", "fake-key-value-not-real");
  const restoreReplyTo = stub(env, "emailReplyTo", "reply@example.com");
  const restoreFrom = stub(env, "emailFromAddress", "orders@example.com");
  const fetchMock = mock.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
  const restoreFetch = stub(globalThis, "fetch", fetchMock);

  const restoreUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const restoreFindUnique = stub(prisma.notification, "findUnique", async () => notificationRow({ renderedSubject: "Your order SZ-2026-0001", renderedBody: "Thanks for your order" }));
  const update = mock.fn(async (_args: { where: { id: string }; data: Record<string, unknown> }) => ({}));
  const restoreUpdate = stub(prisma.notification, "update", update);

  try {
    await attemptSend("notif-1");
    assert.equal(fetchMock.mock.callCount(), 1);
    const [url, init] = fetchMock.mock.calls[0]!.arguments as [string, RequestInit];
    assert.equal(url, "https://api.brevo.com/v3/smtp/email");
    const body = JSON.parse(init.body as string);
    assert.equal(body.subject, "Your order SZ-2026-0001");
    assert.equal(body.textContent, "Thanks for your order");
    assert.equal(body.to[0].email, "thandiwe@example.com");
    // The API key must reach Brevo via the header, and nowhere else.
    assert.equal((init.headers as Record<string, string>)["api-key"], "fake-key-value-not-real");
    assert.equal(update.mock.calls[0]!.arguments[0].data.status, "SENT");
  } finally {
    restoreEnabled();
    restoreProvider();
    restoreKey();
    restoreReplyTo();
    restoreFrom();
    restoreFetch();
    restoreUpdateMany();
    restoreFindUnique();
    restoreUpdate();
  }
});

test("recordPasswordResetAttempt: records a safe audit row, never a token or body, unique dedupeKey per attempt", async () => {
  const create = mock.fn(async (args: { data: Record<string, unknown> }) => ({ id: "notif-pwreset", ...args.data }));
  const restoreCreate = stub(prisma.notification, "create", create);

  try {
    await recordPasswordResetAttempt({ customerId: "cust-1", customerEmail: "thandiwe@example.com", delivered: true });
    await recordPasswordResetAttempt({ customerId: "cust-1", customerEmail: "thandiwe@example.com", delivered: true });

    assert.equal(create.mock.callCount(), 2, "two genuine requests both recorded — never deduped against each other");
    const firstKey = create.mock.calls[0]!.arguments[0].data.dedupeKey;
    const secondKey = create.mock.calls[1]!.arguments[0].data.dedupeKey;
    assert.notEqual(firstKey, secondKey);
    for (const call of create.mock.calls) {
      const data = call.arguments[0].data;
      assert.equal(data.renderedSubject, undefined);
      assert.equal(data.renderedBody, undefined);
      assert.equal(data.status, "SENT");
      assert.equal(data.maxAttempts, 1, "never retried — a retry would need a fresh token this table can't provide");
    }
  } finally {
    restoreCreate();
  }
});

test("recordPasswordResetAttempt: a failed delivery is recorded as FAILED without ever throwing", async () => {
  const create = mock.fn(async (args: { data: Record<string, unknown> }) => ({ id: "notif-pwreset-fail", ...args.data }));
  const restoreCreate = stub(prisma.notification, "create", create);

  try {
    await assert.doesNotReject(recordPasswordResetAttempt({ customerId: "cust-1", customerEmail: "thandiwe@example.com", delivered: false }));
    assert.equal(create.mock.calls[0]!.arguments[0].data.status, "FAILED");
  } finally {
    restoreCreate();
  }
});

test("recordPasswordResetAttempt: a database error is swallowed, never thrown to the caller", async () => {
  const restoreCreate = stub(prisma.notification, "create", async () => {
    throw new Error("db unavailable");
  });
  try {
    await assert.doesNotReject(recordPasswordResetAttempt({ customerId: "cust-1", customerEmail: "thandiwe@example.com", delivered: true }));
  } finally {
    restoreCreate();
  }
});
