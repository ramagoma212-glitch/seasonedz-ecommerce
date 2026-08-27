// Version 7, Milestone 176: admin affiliate application review — brief
// sections 26, 33-39, 60.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../config/prisma.js";
import {
  AdminAffiliateApplicationError,
  approveApplication,
  getApplicationDetail,
  listApplications,
  rejectApplication,
  requestCorrection,
  revealApplicationIdentityNumber,
} from "./adminAffiliateApplication.service.js";

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

function stubActionRequiredNotificationChain() {
  const create = stub(prisma.notification, "create", async () => ({ id: "notif-1" }));
  const updateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const findUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-1", eventType: "AFFILIATE_APPLICATION_ACTION_REQUIRED", templateName: "affiliate-application-action-required",
    recipientEmail: "jane@example.com", orderNumber: null, affiliateId: "affiliate-1", productId: null,
    renderedSubject: "Subject", renderedBody: "Body", attemptCount: 1, maxAttempts: 3,
  }));
  const update = stub(prisma.notification, "update", async () => ({}));
  return { restore: () => { create.restore(); updateMany.restore(); findUnique.restore(); update.restore(); } };
}

const APPLICATION_ROW = {
  id: "app-1", customerId: "cust-1", affiliateId: "affiliate-1", status: "UNDER_REVIEW",
  firstName: "Jane", middleName: null, surname: "Smith", dateOfBirth: null, nationality: "South African",
  identityType: "SA_ID", idNumber: "9001015008088", passportNumber: null,
  contactEmail: "jane@example.com", mobileNumber: "0821234567", whatsappNumber: null, preferredContactMethod: null,
  addressLine1: "12 Oak Road", addressLine2: null, suburb: "Sunnyside", city: "Pretoria", province: "Gauteng", postalCode: "0002", country: "South Africa",
  applicantType: "INDIVIDUAL", businessName: null, businessRegistrationNumber: null, businessWebsite: null,
  promotionPlan: "Social media.", websiteUrl: null, facebookUrl: null, instagramUrl: null, tiktokUrl: null, youtubeUrl: null, otherPlatform: null, audienceSize: null,
  motivation: "Love the brand.", infoAccurateConfirmedAt: new Date(), termsAcceptedAt: new Date(), termsVersion: "2026-08-27",
  actionRequiredReason: null, actionRequiredArea: null, submittedAt: new Date(), reviewedAt: null, approvedAt: null, rejectedAt: null,
  createdAt: new Date(), updatedAt: new Date(), documents: [],
};

test("listApplications: the returned shape has no id-number field at all, not even masked (brief section 33)", async () => {
  const count = stub(prisma.affiliateApplication, "count", async () => 1);
  const findMany = stub(prisma.affiliateApplication, "findMany", async () => [
    { id: "app-1", status: "UNDER_REVIEW", applicantType: "INDIVIDUAL", firstName: "Jane", surname: "Smith", contactEmail: "jane@example.com", mobileNumber: "0821234567", city: "Pretoria", province: "Gauteng", submittedAt: new Date(), updatedAt: new Date() },
  ]);

  const result = await listApplications({ page: 1, limit: 20 });
  const row = result.applications[0] as unknown as Record<string, unknown>;
  assert.equal("idNumber" in row, false);
  assert.equal("idNumberMasked" in row, false);
  assert.equal(row.fullName, "Jane Smith");

  count.restore();
  findMany.restore();
});

test("getApplicationDetail: the identity number is masked by default", async () => {
  const findUnique = stub(prisma.affiliateApplication, "findUnique", async () => APPLICATION_ROW);

  const detail = await getApplicationDetail("app-1");
  assert.equal(detail.identityNumberMasked, "*********8088");
  assert.equal("idNumber" in detail, false);

  findUnique.restore();
});

test("revealApplicationIdentityNumber: returns the full value and writes an audit event", async () => {
  const findUnique = stub(prisma.affiliateApplication, "findUnique", async () => APPLICATION_ROW);
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", mock.fn(async () => ({ id: "event-1" })));

  const full = await revealApplicationIdentityNumber("app-1", "admin-1");
  assert.equal(full, "9001015008088");
  assert.equal(eventCreate.fn.mock.callCount(), 1);
  assert.equal(eventCreate.fn.mock.calls[0]!.arguments[0].data.actorType, "ADMIN");

  findUnique.restore();
  eventCreate.restore();
});

test("requestCorrection: a reason is required", async () => {
  const findUnique = stub(prisma.affiliateApplication, "findUnique", async () => APPLICATION_ROW);

  await assert.rejects(() => requestCorrection("app-1", "", "IDENTITY_DOCUMENT", "admin-1"), AdminAffiliateApplicationError);
  await assert.rejects(() => requestCorrection("app-1", undefined, "IDENTITY_DOCUMENT", "admin-1"), AdminAffiliateApplicationError);

  findUnique.restore();
});

test("requestCorrection: can only be requested while UNDER_REVIEW", async () => {
  const findUnique = stub(prisma.affiliateApplication, "findUnique", async () => ({ ...APPLICATION_ROW, status: "DRAFT" }));

  await assert.rejects(
    () => requestCorrection("app-1", "Please re-upload your ID.", "IDENTITY_DOCUMENT", "admin-1"),
    (error: unknown) => error instanceof AdminAffiliateApplicationError && error.statusCode === 409
  );

  findUnique.restore();
});

test("requestCorrection: a valid request moves status to ACTION_REQUIRED and records the reason/area", async () => {
  const findUnique = stub(prisma.affiliateApplication, "findUnique", async () => APPLICATION_ROW);
  const update = stub(prisma.affiliateApplication, "update", async ({ data }: { data: Record<string, unknown> }) => ({ ...APPLICATION_ROW, ...data, updatedAt: new Date() }));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-2" }));
  const notifications = stubActionRequiredNotificationChain();

  const result = await requestCorrection("app-1", "Please re-upload a clearer ID document.", "IDENTITY_DOCUMENT", "admin-1");
  assert.equal(result.status, "ACTION_REQUIRED");
  assert.equal(result.actionRequiredArea, "IDENTITY_DOCUMENT");

  findUnique.restore();
  update.restore();
  eventCreate.restore();
  await flushAsync();
  notifications.restore();
});

test("approveApplication: only allowed while UNDER_REVIEW", async () => {
  const findUnique = stub(prisma.affiliateApplication, "findUnique", async () => ({ ...APPLICATION_ROW, status: "ACTION_REQUIRED" }));

  await assert.rejects(
    () => approveApplication("app-1", "admin-1"),
    (error: unknown) => error instanceof AdminAffiliateApplicationError && error.statusCode === 409
  );

  findUnique.restore();
});

test("approveApplication: reuses the existing approveAffiliate() to move the real Affiliate row PENDING -> ACTIVE", async () => {
  const findUnique = stub(prisma.affiliateApplication, "findUnique", async () => APPLICATION_ROW);
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ status: "PENDING" }));
  const affiliateUpdate = stub(prisma.affiliate, "update", mock.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "affiliate-1", status: "ACTIVE", ...data, name: "Jane Smith", email: "jane@example.com", phone: null, referralCode: "jane-smith", commissionRateOverride: null, discountRateOverride: null, notes: null, customerId: "cust-1", createdAt: new Date(), updatedAt: new Date() })));
  const applicationUpdate = stub(prisma.affiliateApplication, "update", async ({ data }: { data: Record<string, unknown> }) => ({ ...APPLICATION_ROW, ...data }));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-3" }));
  const settingsFind = stub(prisma.affiliateProgrammeSettings, "findFirst", async () => null);
  const settingsCreate = stub(prisma.affiliateProgrammeSettings, "create", async () => ({ defaultCommissionRate: { toNumber: () => 7 }, defaultReferralDiscountRate: { toNumber: () => 5 }, attributionWindowDays: 30, commissionValidationDays: 30, minimumPayoutAmount: { toNumber: () => 500 }, payoutDayOfMonth: 15, isProgrammeActive: true }));
  const notificationCreate = stub(prisma.notification, "create", async () => ({ id: "notif-2" }));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-2", eventType: "AFFILIATE_APPROVED", templateName: "affiliate-approved", recipientEmail: "jane@example.com",
    orderNumber: null, affiliateId: "affiliate-1", productId: null, renderedSubject: "s", renderedBody: "b", attemptCount: 1, maxAttempts: 3,
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));

  const result = await approveApplication("app-1", "admin-1");
  assert.equal(result.status, "APPROVED");
  assert.equal(affiliateUpdate.fn.mock.callCount(), 1);
  assert.equal(affiliateUpdate.fn.mock.calls[0]!.arguments[0].data.status, "ACTIVE");

  findUnique.restore();
  affiliateFind.restore();
  affiliateUpdate.restore();
  applicationUpdate.restore();
  eventCreate.restore();
  settingsFind.restore();
  settingsCreate.restore();
  await flushAsync();
  notificationCreate.restore();
  notificationUpdateMany.restore();
  notificationFindUnique.restore();
  notificationUpdate.restore();
});

test("rejectApplication: reuses the existing rejectAffiliate() to move the real Affiliate row PENDING -> REJECTED", async () => {
  const findUnique = stub(prisma.affiliateApplication, "findUnique", async () => APPLICATION_ROW);
  const affiliateFind = stub(prisma.affiliate, "findUnique", async () => ({ status: "PENDING" }));
  const affiliateUpdate = stub(prisma.affiliate, "update", mock.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "affiliate-1", status: "REJECTED", ...data, name: "Jane Smith", email: "jane@example.com", phone: null, referralCode: "jane-smith", commissionRateOverride: null, discountRateOverride: null, notes: null, customerId: "cust-1", createdAt: new Date(), updatedAt: new Date() })));
  const applicationUpdate = stub(prisma.affiliateApplication, "update", async ({ data }: { data: Record<string, unknown> }) => ({ ...APPLICATION_ROW, ...data }));
  const eventCreate = stub(prisma.affiliateApplicationEvent, "create", async () => ({ id: "event-4" }));
  const notificationCreate = stub(prisma.notification, "create", async () => ({ id: "notif-3" }));
  const notificationUpdateMany = stub(prisma.notification, "updateMany", async () => ({ count: 1 }));
  const notificationFindUnique = stub(prisma.notification, "findUnique", async () => ({
    id: "notif-3", eventType: "AFFILIATE_REJECTED", templateName: "affiliate-rejected", recipientEmail: "jane@example.com",
    orderNumber: null, affiliateId: "affiliate-1", productId: null, renderedSubject: "s", renderedBody: "b", attemptCount: 1, maxAttempts: 3,
  }));
  const notificationUpdate = stub(prisma.notification, "update", async () => ({}));

  const result = await rejectApplication("app-1", "Documents did not match.", "admin-1");
  assert.equal(result.status, "REJECTED");
  assert.equal(affiliateUpdate.fn.mock.callCount(), 1);
  assert.equal(affiliateUpdate.fn.mock.calls[0]!.arguments[0].data.status, "REJECTED");

  findUnique.restore();
  affiliateFind.restore();
  affiliateUpdate.restore();
  applicationUpdate.restore();
  eventCreate.restore();
  await flushAsync();
  notificationCreate.restore();
  notificationUpdateMany.restore();
  notificationFindUnique.restore();
  notificationUpdate.restore();
});
