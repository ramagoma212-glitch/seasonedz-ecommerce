// Version 7, Milestone 174B: notification-integration coverage for
// createEnquiryHandler()'s ADMIN_NEW_ENQUIRY + CUSTOMER_ENQUIRY_ACKNOWLEDGEMENT
// hooks — this controller had zero test coverage of any kind before
// this milestone. enquiryService is imported as `import * as
// enquiryService`, a frozen ES module namespace (cannot be
// monkeypatched), so createEnquiry() is left to run for real here, with
// only its own single underlying prisma.enquiry.create() call stubbed.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { EnquiryStatus, EnquiryType } from "@prisma/client";
import { prisma } from "../config/prisma.js";
import { createEnquiryHandler } from "./enquiry.controller.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

// createEnquiryHandler() fires both notifications fire-and-forget,
// never awaited into the response — the chains keep running (through
// prisma.notification.create/updateMany/findUnique/update) after the
// handler itself has already sent its response. See order.controller.test.ts's
// own header comment for why this must be stubbed and flushed rather
// than restored synchronously.
function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function fakeRes() {
  const res: { statusCode?: number; body?: unknown } & Partial<Response> = {};
  res.status = mock.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response["status"];
  res.json = mock.fn((body: unknown) => {
    res.body = body;
    return res as Response;
  }) as unknown as Response["json"];
  return res;
}

const VALID_BODY = {
  type: "CONTACT",
  name: "Thandiwe Nkosi",
  email: "thandiwe@example.com",
  message: "I'd like to ask about your colouring book range for a school project.",
};

function fakeReq(body: unknown = VALID_BODY) {
  return { body } as unknown as Request;
}

function stubNotificationChain() {
  const notificationCreate = stub(prisma.notification, "create", async () => ({ id: "notif-1" }));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1",
    eventType: "ADMIN_NEW_ENQUIRY",
    templateName: "admin-new-enquiry",
    recipientEmail: "admin@example.com",
    orderNumber: null,
    affiliateId: null,
    productId: null,
    renderedSubject: "Subject",
    renderedBody: "Body",
    attemptCount: 1,
    maxAttempts: 3,
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));
  return {
    create: notificationCreate,
    restore: async () => {
      await flushAsync();
      notificationCreate.restore();
      notificationUpdateMany.restore();
      notificationFindUnique.restore();
      notificationUpdate.restore();
    },
  };
}

test("a valid enquiry enqueues exactly one ADMIN_NEW_ENQUIRY and one CUSTOMER_ENQUIRY_ACKNOWLEDGEMENT notification", async () => {
  const enquiryCreate = stub(prisma.enquiry, "create", async () => ({
    id: "enquiry-1",
    type: EnquiryType.CONTACT,
    status: EnquiryStatus.NEW,
    createdAt: new Date(),
  }));
  const notifications = stubNotificationChain();
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await createEnquiryHandler(fakeReq(), res as Response, next);

  assert.equal(res.statusCode, 201);
  assert.equal((next as unknown as ReturnType<typeof mock.fn>).mock.callCount(), 0);
  await flushAsync();
  assert.equal(notifications.create.fn.mock.callCount(), 2);

  const calls = notifications.create.fn.mock.calls.map((call) => (call.arguments[0] as { data: Record<string, unknown> }).data);
  const adminNotify = calls.find((data) => data.eventType === "ADMIN_NEW_ENQUIRY");
  const customerAck = calls.find((data) => data.eventType === "CUSTOMER_ENQUIRY_ACKNOWLEDGEMENT");

  assert.ok(adminNotify, "ADMIN_NEW_ENQUIRY notification was enqueued");
  assert.equal(adminNotify!.dedupeKey, "ADMIN_NEW_ENQUIRY:enquiry-1");

  assert.ok(customerAck, "CUSTOMER_ENQUIRY_ACKNOWLEDGEMENT notification was enqueued");
  assert.equal(customerAck!.dedupeKey, "CUSTOMER_ENQUIRY_ACKNOWLEDGEMENT:enquiry-1");
  assert.equal(customerAck!.recipientEmail, "thandiwe@example.com");

  enquiryCreate.restore();
  await notifications.restore();
});

test("an invalid enquiry body is rejected 400 before any enquiry or notification is created", async () => {
  const enquiryCreate = stub(prisma.enquiry, "create", mock.fn(async () => {
    throw new Error("must never be called — validation should reject this request first");
  }));
  const notificationCreate = stub(prisma.notification, "create", mock.fn(async () => ({ id: "notif-1" })));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await createEnquiryHandler(fakeReq({ type: "CONTACT", name: "", email: "not-an-email", message: "" }), res as Response, next);

  assert.equal(res.statusCode, 400);
  await flushAsync();
  assert.equal(enquiryCreate.fn.mock.callCount(), 0);
  assert.equal(notificationCreate.fn.mock.callCount(), 0);

  enquiryCreate.restore();
  notificationCreate.restore();
});
