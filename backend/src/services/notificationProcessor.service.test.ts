// Version 7, Milestone 174B: the recovery/retry batch processor.
// attemptSend() itself is fully covered in notificationEngine.service.test.ts
// — these tests are only about the due-notification query and the
// summary counts, so prisma.notification.findMany/updateMany/findUnique/update
// are all stubbed minimally (a claim that always succeeds, a send that
// always "succeeds" via email disabled).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { env } from "../config/env.js";
import { processDueNotifications } from "./notificationProcessor.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, value: any) {
  const original = obj[key];
  obj[key] = value;
  return () => {
    obj[key] = original;
  };
}

function row(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    eventType: "ORDER_PLACED",
    channel: "EMAIL",
    templateName: "order-created",
    recipientEmail: "thandiwe@example.com",
    recipientCustomerId: null,
    orderNumber: "SZ-2026-0001",
    affiliateId: null,
    productId: null,
    dedupeKey: `key-${id}`,
    renderedSubject: "Subject",
    renderedBody: "Body",
    status: "PROCESSING",
    scheduledAt: new Date(),
    nextAttemptAt: null,
    attemptCount: 1,
    maxAttempts: 3,
    lastError: null,
    sentAt: null,
    failedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test("processDueNotifications: queries both PENDING-due and FAILED-with-retries-due in one pass", async () => {
  const restoreEmail = stub(env, "emailEnabled", false);
  const findMany = mock.fn(async (_args: unknown) => [{ id: "n1" }, { id: "n2" }]);
  const restoreFindMany = stub(prisma.notification, "findMany", findMany);
  const restoreUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  let call = 0;
  const restoreFindUnique = stub(prisma.notification, "findUnique", async (args: { where: { id: string }; select?: unknown }) => {
    call += 1;
    // First call inside attemptSend (post-claim) reads the full row;
    // the processor's own status-check call after each attemptSend
    // asks for just {status: true} — both are satisfied by the same
    // full row here since extra fields are harmless.
    return row(args.where.id, { status: "SENT" });
  });
  const restoreUpdate = stub(prisma.notification, "update", async () => ({}));

  try {
    const result = await processDueNotifications(new Date("2026-08-27T00:00:00Z"));
    assert.equal(findMany.mock.callCount(), 1);
    const queryArgs = findMany.mock.calls[0]!.arguments[0] as { where: { OR: unknown[] } };
    assert.equal(queryArgs.where.OR.length, 2, "one branch for due PENDING, one for due-retry FAILED");
    assert.equal(result.candidateCount, 2);
    assert.ok(call >= 2);
  } finally {
    restoreEmail();
    restoreFindMany();
    restoreUpdateMany();
    restoreFindUnique();
    restoreUpdate();
  }
});

test("processDueNotifications: counts sent vs stillFailed correctly across a mixed batch", async () => {
  const restoreEmail = stub(env, "emailEnabled", false);
  const restoreFindMany = stub(prisma.notification, "findMany", async () => [{ id: "will-send" }, { id: "will-fail" }]);
  const restoreUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const restoreFindUnique = stub(prisma.notification, "findUnique", async (args: { where: { id: string } }) => {
    if (args.where.id === "will-send") return row("will-send", { recipientEmail: "thandiwe@example.com" });
    // Forces a permanent failure via the "no recipient" path — deterministic, no fetch needed.
    return row("will-fail", { recipientEmail: null, status: "SENT" });
  });
  // Simulate attemptSend()'s own internal update() calls actually
  // mutating status by tracking per-id state, so the processor's
  // post-send findUnique (asking only for {status}) reflects reality.
  const statuses: Record<string, string> = { "will-send": "PROCESSING", "will-fail": "PROCESSING" };
  const restoreFindUniqueReal = stub(prisma.notification, "findUnique", async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
    const id = args.where.id;
    if (args.select && Object.keys(args.select).length === 1 && args.select.status) {
      return { status: statuses[id] };
    }
    return row(id, { recipientEmail: id === "will-fail" ? null : "thandiwe@example.com", maxAttempts: 3, attemptCount: 1 });
  });
  const restoreUpdate = stub(prisma.notification, "update", async (args: { where: { id: string }; data: { status?: string } }) => {
    if (args.data.status) statuses[args.where.id] = args.data.status;
    return {};
  });

  try {
    const result = await processDueNotifications();
    assert.equal(result.candidateCount, 2);
    assert.equal(result.sent, 1);
    assert.equal(result.stillFailed, 1);
  } finally {
    restoreEmail();
    restoreFindMany();
    restoreUpdateMany();
    restoreFindUniqueReal();
    restoreUpdate();
    void restoreFindUnique; // superseded by restoreFindUniqueReal above, kept only to satisfy the earlier stub's own restore contract
  }
});

test("processDueNotifications: no candidates due — returns zero counts, no attemptSend calls", async () => {
  const restoreFindMany = stub(prisma.notification, "findMany", async () => []);
  const updateMany = mock.fn(async () => ({ count: 1 }));
  const restoreUpdateMany = stub(prisma.notification, "updateMany", updateMany);

  try {
    const result = await processDueNotifications();
    assert.deepEqual(result, { candidateCount: 0, sent: 0, stillFailed: 0 });
    assert.equal(updateMany.mock.callCount(), 0);
  } finally {
    restoreFindMany();
    restoreUpdateMany();
  }
});

test("processDueNotifications: a single unexpected per-row error does not stop the rest of the batch from being processed (brief section 45)", async () => {
  const restoreEmail = stub(env, "emailEnabled", false);
  const restoreFindMany = stub(prisma.notification, "findMany", async () => [{ id: "throws" }, { id: "fine" }]);
  const restoreUpdateMany = stub(prisma.notification, "updateMany", async (args: { where: { id: string } }) => {
    if (args.where.id === "throws") throw new Error("unexpected claim failure");
    return { count: 1 };
  });
  const findUniqueCalls: string[] = [];
  const restoreFindUnique = stub(prisma.notification, "findUnique", async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
    findUniqueCalls.push(args.where.id);
    if (args.select) return { status: "SENT" };
    return row(args.where.id);
  });
  const restoreUpdate = stub(prisma.notification, "update", async () => ({}));

  try {
    const result = await processDueNotifications();
    assert.equal(result.candidateCount, 2);
    assert.equal(result.stillFailed, 1, "the row that threw is counted as failed, not silently dropped");
    assert.equal(result.sent, 1, "the second row still gets processed despite the first one throwing");
    assert.ok(findUniqueCalls.includes("fine"), "processing continued past the bad row");
  } finally {
    restoreEmail();
    restoreFindMany();
    restoreUpdateMany();
    restoreFindUnique();
    restoreUpdate();
  }
});
