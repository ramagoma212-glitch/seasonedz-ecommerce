// Milestone 202: individual follow-up send service. Prisma is replaced by an
// in-memory fake that applies conditional updates the way the database would,
// so these tests check real state sequences. The delivery function is always
// a fake; no email can be sent from this file.
import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { BrevoSendError } from "../email/providers/brevo.provider.js";
import {
  composeFinalBody,
  listFollowUpQueue,
  previewFollowUp,
  reconcileFollowUpAttempt,
  sendFollowUp,
  type FollowUpSendDependencies,
} from "./followUpEmail.service.js";
import { OutreachContactError } from "./outreachContact.service.js";

const ACTOR = { id: "admin-1", name: "Owner", email: "owner@seasonedz.test" };
const NOW = new Date("2026-10-05T10:00:00.000Z");
const KEY = "composer-session-0001-abcdef";
const SECOND_KEY = "composer-session-0002-abcdef";

const restores: Array<() => void> = [];
afterEach(() => {
  while (restores.length) restores.pop()!();
  db.contact = null;
  db.attempts = new Map();
  db.activities = [];
  db.contactWrites = [];
  db.replies = [];
  db.failReserve = false;
  db.failFinalPersist = false;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  restores.push(() => {
    obj[key] = original;
  });
  return fn;
}

const db: {
  contact: Record<string, any> | null;
  attempts: Map<string, Record<string, any>>;
  activities: Record<string, any>[];
  contactWrites: Record<string, any>[];
  replies: Date[];
  failReserve: boolean;
  failFinalPersist: boolean;
} = {
  contact: null,
  attempts: new Map(),
  activities: [],
  contactWrites: [],
  replies: [],
  failReserve: false,
  failFinalPersist: false,
};

function freshContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "contact-1",
    email: "office@sunnyside.test",
    buyerEmail: null,
    organisationName: "Sunnyside Primary School",
    organisationType: "School",
    contactName: "Mrs Dlamini",
    contactRole: "Principal",
    status: "ACTIVE",
    leadStatus: "CONTACTED",
    lastContactedAt: new Date("2026-09-01T08:00:00.000Z"),
    nextFollowUpAt: new Date("2026-10-20T00:00:00.000Z"),
    nextAction: "Confirm quantities",
    emailSendLockAttemptId: null,
    ...overrides,
  };
}

function install(contact = freshContact()) {
  db.contact = structuredClone(contact);
  db.attempts = new Map();
  db.activities = [];
  db.contactWrites = [];
  db.replies = [];
  db.failReserve = false;
  db.failFinalPersist = false;

  stub(prisma, "$transaction", async (fn: (tx: typeof prisma) => unknown) => {
    if (db.failFinalPersist && db.attempts.size > 0) {
      const settled = [...db.attempts.values()].some((attempt) => attempt.status === "ACCEPTED");
      if (!settled) {
        db.failFinalPersist = false;
        throw new Error("simulated database failure during the final save");
      }
    }
    return fn(prisma);
  });

  stub(prisma.outreachContact, "findUnique", async () => (db.contact ? structuredClone(db.contact) : null));
  stub(prisma.outreachContact, "findMany", async () => (db.contact ? [{ ...structuredClone(db.contact), activities: db.replies.map((occurredAt) => ({ occurredAt })) }] : []));
  stub(prisma.outreachContact, "updateMany", async (args: { where: Record<string, any>; data: Record<string, any> }) => {
    if (!db.contact) return { count: 0 };
    if (args.where.id !== undefined && args.where.id !== db.contact.id) return { count: 0 };
    if (args.where.status !== undefined && db.contact.status !== args.where.status) return { count: 0 };
    if ("emailSendLockAttemptId" in args.where) {
      if (db.contact.emailSendLockAttemptId !== args.where.emailSendLockAttemptId) return { count: 0 };
    }
    if (db.failReserve && "emailSendLockAttemptId" in args.data && typeof args.data.emailSendLockAttemptId === "string") {
      throw new Error("simulated database failure before the send");
    }
    Object.assign(db.contact, args.data);
    db.contactWrites.push(structuredClone(args.data));
    return { count: 1 };
  });
  stub(prisma.outreachContact, "update", async (args: { data: Record<string, any> }) => {
    Object.assign(db.contact!, args.data);
    db.contactWrites.push(structuredClone(args.data));
    return structuredClone(db.contact);
  });

  stub(prisma.outreachEmailAttempt, "findUnique", async (args: { where: Record<string, any> }) => {
    const found = args.where.idempotencyKey
      ? [...db.attempts.values()].find((attempt) => attempt.idempotencyKey === args.where.idempotencyKey)
      : db.attempts.get(args.where.id);
    return found ? structuredClone(found) : null;
  });
  stub(prisma.outreachEmailAttempt, "findMany", async () => [...db.attempts.values()].map((attempt) => structuredClone(attempt)));
  stub(prisma.outreachEmailAttempt, "create", async (args: { data: Record<string, any> }) => {
    const duplicate = [...db.attempts.values()].some((attempt) => attempt.idempotencyKey === args.data.idempotencyKey);
    if (duplicate) {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on idempotencyKey", { code: "P2002", clientVersion: "5.22.0" });
    }
    db.attempts.set(args.data.id, { ...args.data, settledAt: null, failureReason: null });
    return args.data;
  });
  stub(prisma.outreachEmailAttempt, "updateMany", async (args: { where: Record<string, any>; data: Record<string, any> }) => {
    const attempt = db.attempts.get(args.where.id);
    if (!attempt) return { count: 0 };
    if (args.where.status !== undefined && attempt.status !== args.where.status) return { count: 0 };
    Object.assign(attempt, args.data);
    return { count: 1 };
  });

  stub(prisma.outreachActivity, "create", async (args: { data: Record<string, any> }) => {
    db.activities.push(structuredClone(args.data));
    return args.data;
  });
  stub(prisma.outreachActivity, "findMany", async () => db.replies.map((occurredAt) => ({ occurredAt })));
  stub(prisma.outreachCampaignRecipient, "findFirst", async () => null);
  stub(prisma.outreachCampaignRecipient, "findMany", async () => []);
}

function deps(overrides: Partial<FollowUpSendDependencies> = {}) {
  const deliver = mock.fn(async (..._args: unknown[]) => undefined);
  const value: FollowUpSendDependencies = {
    isDeliveryEnabled: () => true,
    deliver: deliver as unknown as FollowUpSendDependencies["deliver"],
    ...overrides,
  };
  return { value, deliver };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: KEY,
    confirmRecipientEmail: "office@sunnyside.test",
    subject: "Following up on Seasonedz Group colouring books",
    body: "Good day Mrs Dlamini,\n\nI wanted to check whether you had a chance to look at our colouring books.\n\nIf you would like to know more, reply to this email.",
    templateKey: "education",
    ...overrides,
  };
}

async function expectOutreachError(promise: Promise<unknown>, pattern: RegExp, statusCode?: number) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof OutreachContactError, `expected OutreachContactError, got ${String(error)}`);
    assert.match(error.message, pattern);
    if (statusCode !== undefined) assert.equal(error.statusCode, statusCode);
    return true;
  });
}

function onlyAttempt() {
  assert.equal(db.attempts.size, 1, "exactly one attempt record exists");
  return [...db.attempts.values()][0]!;
}

// --- preview: read-only -------------------------------------------------------------

test("preview shows the exact recipient, the signature and the unsubscribe footer, and writes nothing", async () => {
  install();
  const preview = await previewFollowUp("contact-1", {}, NOW);
  assert.equal(preview.recipientEmail, "office@sunnyside.test");
  assert.match(preview.fullBody, /Call \/ WhatsApp: \+27 72 844 5644/);
  assert.match(preview.fullBody, /unsubscribe here:/);
  assert.equal(preview.canSend, true);
  assert.equal(db.contactWrites.length, 0);
  assert.equal(db.attempts.size, 0);
  assert.equal(db.activities.length, 0);
});

test("preview marks a suppressed contact as unsendable with the reason, and still writes nothing", async () => {
  install(freshContact({ status: "UNSUBSCRIBED" }));
  const preview = await previewFollowUp("contact-1", {}, NOW);
  assert.equal(preview.canSend, false);
  assert.match(preview.blockedReasons[0]!, /UNSUBSCRIBED/);
  assert.equal(db.contactWrites.length, 0);
});

// --- success ----------------------------------------------------------------------------

test("an ACTIVE contact receives one email: attempt ACCEPTED, lock released, FOLLOW_UP_EMAIL_SENT recorded, lastContactedAt moved", async () => {
  install();
  const { value, deliver } = deps();
  const result = await sendFollowUp("contact-1", request(), ACTOR, value, NOW);

  assert.equal(result.status, "ACCEPTED");
  assert.equal(deliver.mock.callCount(), 1);
  const sent = deliver.mock.calls[0]!.arguments[0] as unknown as Record<string, any>;
  assert.equal(sent.templateName, "outreach-follow-up");
  assert.equal(sent.recipientRole, "contact");
  assert.equal(sent.recipientEmail, "office@sunnyside.test");
  assert.match(sent.rendered.body, /\+27 72 844 5644/, "the official callback number is in the email");
  assert.match(sent.rendered.body, /unsubscribe here:/, "the signed unsubscribe footer is preserved");

  const attempt = onlyAttempt();
  assert.equal(attempt.status, "ACCEPTED");
  assert.equal(db.contact!.emailSendLockAttemptId, null);
  assert.equal(db.activities.length, 1);
  assert.equal(db.activities[0]!.type, "FOLLOW_UP_EMAIL_SENT");
  assert.equal(db.activities[0]!.createdByAdminUserId, ACTOR.id);
  assert.equal(db.contact!.lastContactedAt.toISOString(), NOW.toISOString());
});

test("a successful send never invents or changes a follow-up date or action, and never changes eligibility", async () => {
  install();
  const before = structuredClone(db.contact!);
  await sendFollowUp("contact-1", request(), ACTOR, deps().value, NOW);
  assert.equal(db.contact!.nextFollowUpAt.toISOString(), before.nextFollowUpAt.toISOString());
  assert.equal(db.contact!.nextAction, before.nextAction);
  assert.equal(db.contact!.status, "ACTIVE");
  for (const write of db.contactWrites) {
    assert.ok(!("status" in write), "a follow-up never writes OutreachContact.status");
    assert.ok(!("nextFollowUpAt" in write), "a follow-up never writes nextFollowUpAt");
  }
});

// --- eligibility and validation: nothing is reserved or sent ------------------------------

test("UNSUBSCRIBED, SUPPRESSED, BOUNCED and INVALID contacts are refused before any reservation or send", async () => {
  for (const status of ["UNSUBSCRIBED", "SUPPRESSED", "BOUNCED", "INVALID"]) {
    install(freshContact({ status }));
    const { value, deliver } = deps();
    await expectOutreachError(sendFollowUp("contact-1", request(), ACTOR, value, NOW), new RegExp(`${status}.*eligibility has not been changed`), 409);
    assert.equal(deliver.mock.callCount(), 0, status);
    assert.equal(db.attempts.size, 0, status);
    assert.equal(db.activities.length, 0, status);
    assert.equal(db.contact!.emailSendLockAttemptId, null, status);
    restores.splice(0).reverse().forEach((restore) => restore());
  }
});

test("a recipient address that does not match the contact is refused, so nothing is silently substituted", async () => {
  install();
  const { value, deliver } = deps();
  await expectOutreachError(sendFollowUp("contact-1", request({ confirmRecipientEmail: "someone.else@example.test" }), ACTOR, value, NOW), /does not match/, 409);
  assert.equal(deliver.mock.callCount(), 0);
});

test("copy that claims knowledge of the recipient is refused before any send", async () => {
  install();
  const { value, deliver } = deps();
  await expectOutreachError(sendFollowUp("contact-1", request({ body: "I saw your recent visit to the fair." }), ACTOR, value, NOW), /Please revise/, 400);
  assert.equal(deliver.mock.callCount(), 0);
});

test("when delivery is switched off nothing is reserved, sent or recorded", async () => {
  install();
  const { value, deliver } = deps({ isDeliveryEnabled: () => false });
  await expectOutreachError(sendFollowUp("contact-1", request(), ACTOR, value, NOW), /switched off/, 503);
  assert.equal(deliver.mock.callCount(), 0);
  assert.equal(db.attempts.size, 0);
});

test("a send with no usable idempotency key is refused", async () => {
  install();
  const { value, deliver } = deps();
  await expectOutreachError(sendFollowUp("contact-1", request({ idempotencyKey: "short" }), ACTOR, value, NOW), /could not be identified/, 400);
  assert.equal(deliver.mock.callCount(), 0);
});

// --- provider outcomes ----------------------------------------------------------------------

test("a definite provider refusal records FAILED, releases the lock, records no activity, and allows a fresh send with a new key", async () => {
  install();
  const refusing = deps({
    deliver: (async () => {
      throw new BrevoSendError("Brevo send failed (400).", "REJECTED");
    }) as unknown as FollowUpSendDependencies["deliver"],
  });
  await expectOutreachError(sendFollowUp("contact-1", request(), ACTOR, refusing.value, NOW), /did not accept the message, so nothing was sent/, 502);
  assert.equal(onlyAttempt().status, "FAILED");
  assert.equal(db.contact!.emailSendLockAttemptId, null);
  assert.equal(db.activities.length, 0);
  assert.equal(db.contact!.lastContactedAt.toISOString(), "2026-09-01T08:00:00.000Z", "a failed send never moves lastContactedAt");

  const retry = deps();
  const result = await sendFollowUp("contact-1", request({ idempotencyKey: SECOND_KEY }), ACTOR, retry.value, NOW);
  assert.equal(result.status, "ACCEPTED");
  assert.equal(retry.deliver.mock.callCount(), 1);
});

test("an unknown provider outcome records UNCERTAIN and keeps the lock, so a new send is refused without calling the provider", async () => {
  install();
  const unknown = deps({
    deliver: (async () => {
      throw new BrevoSendError("Could not reach Brevo.", "UNREACHABLE");
    }) as unknown as FollowUpSendDependencies["deliver"],
  });
  await expectOutreachError(sendFollowUp("contact-1", request(), ACTOR, unknown.value, NOW), /Do not resend/, 502);
  assert.equal(onlyAttempt().status, "UNCERTAIN");
  assert.ok(db.contact!.emailSendLockAttemptId, "the lock stays held");
  assert.equal(db.activities.length, 0, "no success is recorded for an unknown outcome");
  assert.equal(db.contact!.lastContactedAt.toISOString(), "2026-09-01T08:00:00.000Z");

  const again = deps();
  await expectOutreachError(sendFollowUp("contact-1", request({ idempotencyKey: SECOND_KEY }), ACTOR, again.value, NOW), /already in progress or its outcome is unconfirmed/, 409);
  assert.equal(again.deliver.mock.callCount(), 0, "no blind duplicate after an uncertain outcome");
});

// --- duplicate and concurrent protection ----------------------------------------------------

test("the same key submitted again after success is a replay: it returns the stored result and sends nothing", async () => {
  install();
  const first = deps();
  await sendFollowUp("contact-1", request(), ACTOR, first.value, NOW);

  const second = deps();
  const replay = await sendFollowUp("contact-1", request(), ACTOR, second.value, NOW);
  assert.equal(replay.replayed, true);
  assert.equal(second.deliver.mock.callCount(), 0);
  assert.equal(db.activities.length, 1, "still exactly one recorded follow-up");
});

test("a double-click with the same key while the first send is in flight never produces a second email", async () => {
  install();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const enteredProvider = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let providerCalls = 0;
  const slow = deps({
    deliver: (async () => {
      providerCalls += 1;
      entered();
      await gate;
    }) as unknown as FollowUpSendDependencies["deliver"],
  });

  const first = sendFollowUp("contact-1", request(), ACTOR, slow.value, NOW);
  await enteredProvider;
  await expectOutreachError(sendFollowUp("contact-1", request(), ACTOR, slow.value, NOW), /already submitted|already in progress/, 409);
  release();
  await first;
  assert.equal(providerCalls, 1);
  assert.equal(onlyAttempt().status, "ACCEPTED");
});

test("a different session, with a different key, cannot send while one is in flight: the contact lock refuses it", async () => {
  install();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const enteredProvider = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let providerCalls = 0;
  const slow = deps({
    deliver: (async () => {
      providerCalls += 1;
      entered();
      await gate;
    }) as unknown as FollowUpSendDependencies["deliver"],
  });

  const first = sendFollowUp("contact-1", request(), ACTOR, slow.value, NOW);
  await enteredProvider;
  await expectOutreachError(sendFollowUp("contact-1", request({ idempotencyKey: SECOND_KEY }), ACTOR, slow.value, NOW), /already in progress/, 409);
  release();
  await first;
  assert.equal(providerCalls, 1);
});

// --- database failures around the provider ---------------------------------------------------

test("a database failure before the provider call sends nothing and leaves no lock behind", async () => {
  install();
  db.failReserve = true;
  const { value, deliver } = deps();
  await expectOutreachError(sendFollowUp("contact-1", request(), ACTOR, value, NOW), /could not be prepared, so nothing was sent/, 503);
  assert.equal(deliver.mock.callCount(), 0);
  assert.equal(db.contact!.emailSendLockAttemptId, null);
});

test("a database failure after the provider accepted leaves the contact locked and records no success", async () => {
  install();
  const { value, deliver } = deps();
  // Fail only the final recording step, after the provider has accepted.
  const originalDeliver = deliver;
  const accepting = deps({
    deliver: (async (...args: unknown[]) => {
      await originalDeliver(...args);
      db.failFinalPersist = true;
    }) as unknown as FollowUpSendDependencies["deliver"],
  });
  await expectOutreachError(sendFollowUp("contact-1", request(), ACTOR, accepting.value, NOW), /accepted by the provider, but it could not be recorded/, 500);
  assert.equal(originalDeliver.mock.callCount(), 1, "the email was accepted once");
  assert.ok(db.contact!.emailSendLockAttemptId, "the contact stays locked until reconciled");
  assert.equal(onlyAttempt().status, "RESERVED");
  assert.equal(db.activities.length, 0, "no success is claimed without the record");

  const retry = deps();
  await expectOutreachError(sendFollowUp("contact-1", request({ idempotencyKey: SECOND_KEY }), ACTOR, retry.value, NOW), /already in progress/, 409);
  assert.equal(retry.deliver.mock.callCount(), 0);
});

// --- reconciliation -------------------------------------------------------------------------------

test("an admin confirming a delivered uncertain send records the follow-up, releases the lock and moves lastContactedAt", async () => {
  install();
  const unknown = deps({
    deliver: (async () => {
      throw new BrevoSendError("Could not reach Brevo.", "UNREACHABLE");
    }) as unknown as FollowUpSendDependencies["deliver"],
  });
  await expectOutreachError(sendFollowUp("contact-1", request(), ACTOR, unknown.value, NOW), /Do not resend/, 502);
  const attemptId = onlyAttempt().id;

  const later = new Date("2026-10-05T12:00:00.000Z");
  const result = await reconcileFollowUpAttempt("contact-1", attemptId, { outcome: "SENT", note: "Found it in the sent folder" }, ACTOR, later);
  assert.equal(result.status, "CONFIRMED_SENT");
  assert.equal(db.contact!.emailSendLockAttemptId, null);
  assert.equal(db.contact!.lastContactedAt.toISOString(), later.toISOString());
  assert.equal(db.activities.at(-1)!.type, "FOLLOW_UP_EMAIL_SENT");
  assert.match(db.activities.at(-1)!.details, /Found it in the sent folder/);
});

test("an admin confirming an uncertain send was NOT delivered releases the lock without recording a follow-up", async () => {
  install();
  const unknown = deps({
    deliver: (async () => {
      throw new BrevoSendError("Could not reach Brevo.", "UNREACHABLE");
    }) as unknown as FollowUpSendDependencies["deliver"],
  });
  await expectOutreachError(sendFollowUp("contact-1", request(), ACTOR, unknown.value, NOW), /Do not resend/, 502);
  const attemptId = onlyAttempt().id;
  const result = await reconcileFollowUpAttempt("contact-1", attemptId, { outcome: "NOT_SENT", note: "Checked the mailbox, nothing arrived" }, ACTOR, NOW);
  assert.equal(result.status, "CONFIRMED_NOT_SENT");
  assert.equal(db.contact!.emailSendLockAttemptId, null);
  assert.equal(db.activities.length, 0);
  assert.equal(db.contact!.lastContactedAt.toISOString(), "2026-09-01T08:00:00.000Z");
});

test("reconciliation needs a real note and cannot touch a send that already succeeded", async () => {
  install();
  await sendFollowUp("contact-1", request(), ACTOR, deps().value, NOW);
  const acceptedId = onlyAttempt().id;
  await expectOutreachError(reconcileFollowUpAttempt("contact-1", acceptedId, { outcome: "SENT", note: "checked it" }, ACTOR, NOW), /unresolved/, 409);

  install();
  const unknown = deps({
    deliver: (async () => {
      throw new BrevoSendError("Could not reach Brevo.", "UNREACHABLE");
    }) as unknown as FollowUpSendDependencies["deliver"],
  });
  await expectOutreachError(sendFollowUp("contact-1", request(), ACTOR, unknown.value, NOW), /Do not resend/, 502);
  await expectOutreachError(reconcileFollowUpAttempt("contact-1", onlyAttempt().id, { outcome: "SENT", note: "ok" }, ACTOR, NOW), /at least 5 characters|between 5 and 1000/, 400);
});

// --- Needs Follow-up queue --------------------------------------------------------------------

test("the queue lists only contacts the rule marks as needing a follow-up, with the reason", async () => {
  install(freshContact({ nextFollowUpAt: new Date("2026-10-01T00:00:00.000Z") }));
  const queue = await listFollowUpQueue(NOW);
  assert.equal(queue.counts.needsFollowUp, 1);
  assert.match(queue.items[0]!.reason, /was due on/);
  assert.equal(queue.items[0]!.email, "office@sunnyside.test");
});

test("a contact with a recorded reply after the last contact is excluded from the queue and counted as replied", async () => {
  install(freshContact({ nextFollowUpAt: null }));
  db.replies = [new Date("2026-09-15T09:00:00.000Z")];
  const queue = await listFollowUpQueue(NOW);
  assert.equal(queue.items.length, 0);
  assert.equal(queue.counts.replied, 1);
});

test("a contact whose send is unresolved is excluded from the queue", async () => {
  install(freshContact({ nextFollowUpAt: null, emailSendLockAttemptId: "attempt-x" }));
  const queue = await listFollowUpQueue(NOW);
  assert.equal(queue.items.length, 0);
});

// --- composed body shape ----------------------------------------------------------------------

test("composeFinalBody adds the signature and the signed unsubscribe footer after the admin's message", () => {
  const body = composeFinalBody("Hello there.", "contact-1");
  assert.match(body, /^Hello there\./);
  assert.ok(body.indexOf("Kind regards") > body.indexOf("Hello there."));
  assert.ok(body.indexOf("unsubscribe here:") > body.indexOf("Kind regards"));
});
