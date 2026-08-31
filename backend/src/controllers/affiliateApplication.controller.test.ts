// Version 7, Milestone 176: affiliate application controller — IDOR/
// wiring coverage (brief sections 48, 59). The underlying business
// logic is covered in affiliateApplication.service.test.ts.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma.js";
import { getMyApplicationHandler, getMyDocumentSignedUrlHandler, updateMyApplicationHandler, uploadMyDocumentHandler } from "./affiliateApplication.controller.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
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

test("getMyApplicationHandler: unauthenticated requests are rejected 401 before any database call", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", mock.fn(async () => null));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await getMyApplicationHandler({} as Request, res as Response, next);

  assert.equal(res.statusCode, 401);
  assert.equal(applicationFind.fn.mock.callCount(), 0);

  applicationFind.restore();
});

test("getMyApplicationHandler: an application is always looked up by req.customerUser.id, never by any client-supplied id (brief section 48)", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", mock.fn(async (args: { where: { customerId: string } }) => {
    assert.equal(args.where.customerId, "cust-1", "must only ever query by the authenticated customer's own id");
    return { id: "app-1", customerId: "cust-1", status: "DRAFT" };
  }));
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => null);
  const documentsFindMany = stub(prisma.affiliateApplicationDocument, "findMany", async () => []);
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  // Even though the body carries a DIFFERENT applicationId, the handler
  // never reads it — identity is derived exclusively from
  // req.customerUser.id (requireCustomerAuth), matching every other
  // customer-facing controller in this backend.
  await getMyApplicationHandler({ customerUser: { id: "cust-1" }, body: { applicationId: "someone-elses-app" } } as unknown as Request, res as Response, next);

  assert.equal(applicationFind.fn.mock.callCount(), 1);

  applicationFind.restore();
  affiliateFind.restore();
  documentsFindMany.restore();
});

test("updateMyApplicationHandler: unauthenticated requests are rejected 401", async () => {
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await updateMyApplicationHandler({ body: { firstName: "x" } } as Request, res as Response, next);

  assert.equal(res.statusCode, 401);
});

test("getMyDocumentSignedUrlHandler: a document lookup is always scoped to the caller's OWN application id — a guessed documentId belonging to another applicant can never resolve (brief section 48)", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => ({ id: "my-app-1" }));
  const documentFind = stub(prisma.affiliateApplicationDocument, "findFirst", mock.fn(async (args: { where: { id: string; applicationId: string } }) => {
    assert.equal(args.where.applicationId, "my-app-1", "must always scope by the caller's own application id");
    return null; // simulates a documentId that belongs to a different applicant
  }));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await getMyDocumentSignedUrlHandler({ customerUser: { id: "cust-1" }, params: { documentId: "someone-elses-document" } } as unknown as Request, res as Response, next);

  assert.equal(documentFind.fn.mock.callCount(), 1);
  assert.equal(res.statusCode, 404);

  applicationFind.restore();
  documentFind.restore();
});

// Milestone 178, brief section 12: the new required document slot.
const FAKE_FILE = { buffer: Buffer.from("%PDF-1.4 synthetic"), mimetype: "application/pdf", size: 20, originalname: "letter.pdf" };

test("uploadMyDocumentHandler: rejects an unrecognised slot with 400 before any database call", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", mock.fn(async () => null));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await uploadMyDocumentHandler(
    { customerUser: { id: "cust-1" }, file: FAKE_FILE, body: { slot: "SOMETHING_ELSE" } } as unknown as Request,
    res as Response,
    next
  );

  assert.equal(res.statusCode, 400);
  assert.equal(applicationFind.fn.mock.callCount(), 0, "an invalid slot must never reach the database");

  applicationFind.restore();
});

test("uploadMyDocumentHandler: BANKING_CONFIRMATION_LETTER is accepted with no identityDocumentType/proofOfResidenceType required (it has no sub-type selector)", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", mock.fn(async () => ({ id: "app-1", status: "DRAFT" })));
  const res = fakeRes();
  const next = mock.fn() as unknown as NextFunction;

  await uploadMyDocumentHandler(
    { customerUser: { id: "cust-1" }, file: FAKE_FILE, body: { slot: "BANKING_CONFIRMATION_LETTER" } } as unknown as Request,
    res as Response,
    next
  );

  // Storage is unconfigured in this test environment, so the request
  // cannot succeed end-to-end here (that full flow is covered in
  // affiliateDocument.service.test.ts) — what this test pins down is
  // that slot validation itself passed and requireMyApplicationId's own
  // lookup was reached, proving BANKING_CONFIRMATION_LETTER is not
  // rejected as an "unrecognised slot" the way it would have been
  // before this milestone.
  assert.equal(applicationFind.fn.mock.callCount(), 1);
  assert.notEqual(res.statusCode, 400);

  applicationFind.restore();
});
