// Version 7, Milestone 176: affiliate application lifecycle — brief
// sections 5-10, 28-31, 50-51, 58.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import { AffiliateApplicationError, getOrCreateMyApplication, submitMyApplication, updateMyApplicationFields } from "./affiliateApplication.service.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub<T extends object, K extends keyof T>(obj: T, key: K, impl: (...args: any[]) => any) {
  const original = obj[key];
  const fn = mock.fn(impl);
  obj[key] = fn as unknown as T[K];
  return { fn, restore: () => { obj[key] = original; } };
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

// Same "stub the raw prisma.notification.* chain" discipline as
// customerAffiliate.service.test.ts's own applyForAffiliateProgramme()
// tests — this is a fire-and-forget notificationEngine.enqueueAndSendNow()
// call, never awaited into the caller.
function stubNotificationChain(recipientEmail: string, affiliateId: string) {
  const create = stub(prisma.notification, "create", async () => ({ id: "notif-1" }));
  const updateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const findUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1",
    eventType: "AFFILIATE_APPLICATION_SUBMITTED",
    templateName: "affiliate-application-submitted",
    recipientEmail,
    orderNumber: null,
    affiliateId,
    productId: null,
    renderedSubject: "Subject",
    renderedBody: "Body",
    attemptCount: 1,
    maxAttempts: 3,
  }));
  const update = stub(prisma.notification, "update", async () => ({}));
  return {
    restore: () => {
      create.restore();
      updateMany.restore();
      findUnique.restore();
      update.restore();
    },
  };
}

// ---------------------------------------------------------------------------
// getOrCreateMyApplication.
// ---------------------------------------------------------------------------

test("getOrCreateMyApplication: returns the existing application unchanged if one already exists", async () => {
  const existing = { id: "app-1", customerId: "cust-1", status: "DRAFT", firstName: "Jane", middleName: null, surname: "Smith", dateOfBirth: null, nationality: null, identityType: null, idNumber: null, passportNumber: null, contactEmail: "jane@example.com", mobileNumber: null, whatsappNumber: null, preferredContactMethod: null, addressLine1: null, addressLine2: null, suburb: null, city: null, province: null, postalCode: null, country: null, applicantType: "INDIVIDUAL", businessName: null, businessRegistrationNumber: null, businessWebsite: null, promotionPlan: null, websiteUrl: null, facebookUrl: null, instagramUrl: null, tiktokUrl: null, youtubeUrl: null, otherPlatform: null, audienceSize: null, motivation: null, infoAccurateConfirmedAt: null, termsAcceptedAt: null, actionRequiredReason: null, actionRequiredArea: null, submittedAt: null, createdAt: new Date(), updatedAt: new Date() };
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => existing);
  const documentsFindMany = stub(prisma.affiliateApplicationDocument, "findMany", async () => []);

  const result = await getOrCreateMyApplication("cust-1");
  assert.equal(result?.id, "app-1");

  applicationFind.restore();
  documentsFindMany.restore();
});

test("getOrCreateMyApplication: a legacy PENDING affiliate with no application gets a DRAFT linked to it (never a second createAffiliate call)", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => null);
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ id: "legacy-affiliate-1", status: "PENDING" }));
  const applicationCreate = stub(prisma.affiliateApplication, "create", async ({ data }: { data: Record<string, unknown> }) => ({
    id: "app-2", ...data, middleName: null, surname: null, dateOfBirth: null, nationality: null, identityType: null, idNumber: null, passportNumber: null, contactEmail: null, mobileNumber: null, whatsappNumber: null, preferredContactMethod: null, addressLine1: null, addressLine2: null, suburb: null, city: null, province: null, postalCode: null, country: null, applicantType: "INDIVIDUAL", businessName: null, businessRegistrationNumber: null, businessWebsite: null, promotionPlan: null, websiteUrl: null, facebookUrl: null, instagramUrl: null, tiktokUrl: null, youtubeUrl: null, otherPlatform: null, audienceSize: null, motivation: null, infoAccurateConfirmedAt: null, termsAcceptedAt: null, actionRequiredReason: null, actionRequiredArea: null, submittedAt: null, createdAt: new Date(), updatedAt: new Date(),
  }));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-1" }));

  const result = await getOrCreateMyApplication("cust-1");
  assert.equal(result?.status, "DRAFT");
  const createArgs = applicationCreate.fn.mock.calls[0]!.arguments[0].data;
  assert.equal(createArgs.affiliateId, "legacy-affiliate-1");

  applicationFind.restore();
  affiliateFind.restore();
  applicationCreate.restore();
  eventCreate.restore();
});

test("getOrCreateMyApplication: a legacy ACTIVE affiliate with no application returns null — never forced into a new application (brief section 50)", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => null);
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ id: "legacy-affiliate-2", status: "ACTIVE" }));

  const result = await getOrCreateMyApplication("cust-1");
  assert.equal(result, null);

  applicationFind.restore();
  affiliateFind.restore();
});

test("getOrCreateMyApplication: a brand-new applicant gets a fresh DRAFT pre-filled from their account (never overwriting the account itself)", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => null);
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => null);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ firstName: "Thandiwe", lastName: "Nkosi", email: "thandiwe@example.com", phone: "0821234567" }));
  const applicationCreate = stub(prisma.affiliateApplication, "create", async ({ data }: { data: Record<string, unknown> }) => ({
    id: "app-3", ...data, middleName: null, surname: data.surname, dateOfBirth: null, nationality: null, identityType: null, idNumber: null, passportNumber: null, contactEmail: data.contactEmail, mobileNumber: data.mobileNumber, whatsappNumber: null, preferredContactMethod: null, addressLine1: null, addressLine2: null, suburb: null, city: null, province: null, postalCode: null, country: null, applicantType: "INDIVIDUAL", businessName: null, businessRegistrationNumber: null, businessWebsite: null, promotionPlan: null, websiteUrl: null, facebookUrl: null, instagramUrl: null, tiktokUrl: null, youtubeUrl: null, otherPlatform: null, audienceSize: null, motivation: null, infoAccurateConfirmedAt: null, termsAcceptedAt: null, actionRequiredReason: null, actionRequiredArea: null, submittedAt: null, createdAt: new Date(), updatedAt: new Date(),
  }));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-2" }));

  const result = await getOrCreateMyApplication("cust-1");
  assert.equal(result?.firstName, "Thandiwe");
  assert.equal(result?.contactEmail, "thandiwe@example.com");
  assert.equal(result?.mobileNumber, "0821234567");

  applicationFind.restore();
  affiliateFind.restore();
  customerFind.restore();
  applicationCreate.restore();
  eventCreate.restore();
});

// ---------------------------------------------------------------------------
// updateMyApplicationFields.
// ---------------------------------------------------------------------------

const DRAFT_ROW = { id: "app-1", customerId: "cust-1", status: "DRAFT", affiliateId: null, contactEmail: "jane@example.com", firstName: "Jane" };

test("updateMyApplicationFields: cannot edit once the application is UNDER_REVIEW", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => ({ ...DRAFT_ROW, status: "UNDER_REVIEW" }));

  await assert.rejects(
    () => updateMyApplicationFields("cust-1", { firstName: "New Name" }),
    (error: unknown) => error instanceof AffiliateApplicationError && error.statusCode === 409
  );

  applicationFind.restore();
});

test("updateMyApplicationFields: rejects an unrecognised field outright", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => DRAFT_ROW);

  await assert.rejects(() => updateMyApplicationFields("cust-1", { notARealField: "x" }), AffiliateApplicationError);

  applicationFind.restore();
});

test("updateMyApplicationFields: rejects a structurally invalid SA ID number", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => DRAFT_ROW);

  await assert.rejects(() => updateMyApplicationFields("cust-1", { idNumber: "1234567890123" }), AffiliateApplicationError);

  applicationFind.restore();
});

test("updateMyApplicationFields: rejects a province outside the real SA province list", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => DRAFT_ROW);

  await assert.rejects(() => updateMyApplicationFields("cust-1", { province: "Narnia" }), AffiliateApplicationError);

  applicationFind.restore();
});

test("updateMyApplicationFields: an explicit true sets the declaration timestamp; a later false clears it (brief section 31: never pre-ticked)", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => DRAFT_ROW);
  const update = stub(prisma.affiliateApplication, "update", async ({ data }: { data: Record<string, unknown> }) => ({ ...DRAFT_ROW, ...data }));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-3" }));
  const documentsFindMany = stub(prisma.affiliateApplicationDocument, "findMany", async () => []);

  await updateMyApplicationFields("cust-1", { termsAccepted: true });
  const firstCallData = update.fn.mock.calls[0]!.arguments[0].data;
  assert.ok(firstCallData.termsAcceptedAt instanceof Date);
  assert.equal(typeof firstCallData.termsVersion, "string");

  await updateMyApplicationFields("cust-1", { termsAccepted: false });
  const secondCallData = update.fn.mock.calls[1]!.arguments[0].data;
  assert.equal(secondCallData.termsAcceptedAt, null);

  applicationFind.restore();
  update.restore();
  eventCreate.restore();
  documentsFindMany.restore();
});

// ---------------------------------------------------------------------------
// submitMyApplication.
// ---------------------------------------------------------------------------

const COMPLETE_DRAFT = {
  id: "app-1", customerId: "cust-1", status: "DRAFT", affiliateId: null,
  firstName: "Jane", surname: "Smith", dateOfBirth: new Date("1990-01-01"), nationality: "South African",
  identityType: "SA_ID", idNumber: "9001015008088", passportNumber: null,
  contactEmail: "jane@example.com", mobileNumber: "0821234567",
  addressLine1: "12 Oak Road", suburb: "Sunnyside", city: "Pretoria", province: "Gauteng", postalCode: "0002", country: "South Africa",
  applicantType: "INDIVIDUAL", businessName: null,
  promotionPlan: "I'll share on social media.", motivation: "I love Seasonedz products.",
  infoAccurateConfirmedAt: new Date(), termsAcceptedAt: new Date(),
};

test("submitMyApplication: rejects when a required field is missing", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => ({ ...COMPLETE_DRAFT, nationality: null }));

  await assert.rejects(() => submitMyApplication("cust-1"), AffiliateApplicationError);

  applicationFind.restore();
});

test("submitMyApplication: rejects when declarations are not both confirmed", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => ({ ...COMPLETE_DRAFT, termsAcceptedAt: null }));

  await assert.rejects(() => submitMyApplication("cust-1"), AffiliateApplicationError);

  applicationFind.restore();
});

test("submitMyApplication: rejects when the Banking Confirmation Letter has not been uploaded (brief section 12: the only required document for a new application)", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => COMPLETE_DRAFT);
  const docFind = stub(prisma.affiliateApplicationDocument, "findFirst", async () => null);

  await assert.rejects(() => submitMyApplication("cust-1"), (error: unknown) => error instanceof AffiliateApplicationError && /Banking Confirmation Letter/.test(error.message));

  applicationFind.restore();
  docFind.restore();
});

test("submitMyApplication: requireCurrentDocuments queries only the BANKING_CONFIRMATION_LETTER slot — never IDENTITY/PROOF_OF_RESIDENCE (brief section 12: no longer required for a new/resubmitting application)", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => COMPLETE_DRAFT);
  const docFind = stub(prisma.affiliateApplicationDocument, "findFirst", mock.fn(async () => ({ id: "doc-1" })));
  const affiliateEmailFind = stub(prisma.affiliate, "findUnique", async () => null);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ id: "cust-1" }));
  const affiliateCreate = stub(prisma.affiliate, "create", async ({ data }: { data: Record<string, unknown> }) => ({ id: "new-affiliate-2", ...data, approvedAt: null, createdAt: new Date(), updatedAt: new Date() }));
  const applicationUpdate = stub(prisma.affiliateApplication, "update", async ({ data }: { data: Record<string, unknown> }) => ({ ...COMPLETE_DRAFT, ...data, updatedAt: new Date() }));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-6" }));
  const documentsFindMany = stub(prisma.affiliateApplicationDocument, "findMany", async () => []);
  const notifications = stubNotificationChain("jane@example.com", "new-affiliate-2");

  await submitMyApplication("cust-1");

  assert.equal(docFind.fn.mock.callCount(), 1, "exactly one document lookup, not the old two-slot Promise.all");
  assert.equal(docFind.fn.mock.calls[0]!.arguments[0].where.slot, "BANKING_CONFIRMATION_LETTER");

  applicationFind.restore();
  docFind.restore();
  affiliateEmailFind.restore();
  customerFind.restore();
  affiliateCreate.restore();
  applicationUpdate.restore();
  eventCreate.restore();
  documentsFindMany.restore();
  await flushAsync();
  notifications.restore();
});

test("submitMyApplication: a genuinely complete application creates the Affiliate exactly once and moves to UNDER_REVIEW", async () => {
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => COMPLETE_DRAFT);
  const docFind = stub(prisma.affiliateApplicationDocument, "findFirst", async () => ({ id: "doc-1" }));
  const affiliateEmailFind = stub(prisma.affiliate, "findUnique", async () => null);
  const customerFind = stub(prisma.customer, "findUnique", async () => ({ id: "cust-1" }));
  const affiliateCreate = stub(prisma.affiliate, "create", mock.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new-affiliate-1", ...data, approvedAt: null, createdAt: new Date(), updatedAt: new Date() })));
  const applicationUpdate = stub(prisma.affiliateApplication, "update", async ({ data }: { data: Record<string, unknown> }) => ({ ...COMPLETE_DRAFT, ...data, updatedAt: new Date() }));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-4" }));
  const documentsFindMany = stub(prisma.affiliateApplicationDocument, "findMany", async () => []);
  const notifications = stubNotificationChain("jane@example.com", "new-affiliate-1");

  const result = await submitMyApplication("cust-1");
  assert.equal(result.status, "UNDER_REVIEW");
  assert.equal(affiliateCreate.fn.mock.callCount(), 1, "createAffiliate must be called exactly once");

  applicationFind.restore();
  docFind.restore();
  affiliateEmailFind.restore();
  customerFind.restore();
  affiliateCreate.restore();
  applicationUpdate.restore();
  eventCreate.restore();
  documentsFindMany.restore();
  await flushAsync();
  notifications.restore();
});

test("submitMyApplication: resubmitting after ACTION_REQUIRED reuses the already-linked affiliate — never calls createAffiliate again", async () => {
  const alreadyLinked = { ...COMPLETE_DRAFT, status: "ACTION_REQUIRED", affiliateId: "existing-affiliate-1" };
  const applicationFind = stub(prisma.affiliateApplication, "findUnique", async () => alreadyLinked);
  const docFind = stub(prisma.affiliateApplicationDocument, "findFirst", async () => ({ id: "doc-1" }));
  const affiliateCreate = stub(prisma.affiliate, "create", mock.fn(async () => {
    throw new Error("must never be called on resubmission — the affiliate is already linked");
  }));
  const applicationUpdate = stub(prisma.affiliateApplication, "update", async ({ data }: { data: Record<string, unknown> }) => ({ ...alreadyLinked, ...data, updatedAt: new Date() }));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-5" }));
  const documentsFindMany = stub(prisma.affiliateApplicationDocument, "findMany", async () => []);
  const notifications = stubNotificationChain("jane@example.com", "existing-affiliate-1");

  const result = await submitMyApplication("cust-1");
  assert.equal(result.status, "UNDER_REVIEW");
  assert.equal(affiliateCreate.fn.mock.callCount(), 0);

  applicationFind.restore();
  docFind.restore();
  affiliateCreate.restore();
  applicationUpdate.restore();
  eventCreate.restore();
  documentsFindMany.restore();
  await flushAsync();
  notifications.restore();
});
