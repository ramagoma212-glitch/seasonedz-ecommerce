// Version 7, Milestone 176: affiliate application/document
// verification — customer-facing form page and admin review pages.
// Same "mocked state, real backend never touched" discipline as
// affiliatePortalAndPaymentConfirmation.spec.js.
import { test, expect } from "@playwright/test";

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

function mockLoggedInCustomer(page) {
  return Promise.all([
    page.route("**/api/customers/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ customer: { id: "c1", email: "thandiwe@example.com", firstName: "Thandiwe", lastName: "Nkosi", phone: null, type: "REGISTERED", profileImageUrl: null, createdAt: new Date().toISOString() } }),
      })
    ),
    page.route("**/api/auth/providers", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ google: false, facebook: false, apple: false }) })),
  ]);
}

const DRAFT_APPLICATION = {
  id: "app-1",
  status: "DRAFT",
  firstName: "Thandiwe",
  middleName: null,
  surname: "Nkosi",
  dateOfBirth: null,
  nationality: null,
  identityType: null,
  idNumberMasked: null,
  passportNumberMasked: null,
  contactEmail: "thandiwe@example.com",
  mobileNumber: null,
  whatsappNumber: null,
  preferredContactMethod: null,
  addressLine1: null,
  addressLine2: null,
  suburb: null,
  city: null,
  province: null,
  postalCode: null,
  country: null,
  applicantType: "INDIVIDUAL",
  businessName: null,
  businessRegistrationNumber: null,
  businessWebsite: null,
  promotionPlan: null,
  websiteUrl: null,
  facebookUrl: null,
  instagramUrl: null,
  tiktokUrl: null,
  youtubeUrl: null,
  otherPlatform: null,
  audienceSize: null,
  motivation: null,
  infoAccurateConfirmed: false,
  termsAccepted: false,
  actionRequiredReason: null,
  actionRequiredArea: null,
  submittedAt: null,
  documents: [],
};

function mockMyApplication(page, application) {
  return page.route("**/api/customers/affiliate/application", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ hasApplication: application !== null, application }) });
  });
}

test.describe("Customer affiliate application page", () => {
  test("shows a sign-in prompt when logged out", async ({ page }) => {
    await page.route("**/api/customers/affiliate/application", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) })
    );
    await page.goto("/account/affiliate-application");
    await expect(page.getByText("Please sign in to apply.")).toBeVisible();
  });

  test("a DRAFT application renders the full editable form with all section headings", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockMyApplication(page, DRAFT_APPLICATION);

    await page.goto("/account/affiliate-application");
    await expect(page.locator("#affiliate-application-form")).toBeVisible();
    // Milestone 178: "Identity Verification"/"Proof of Residence" are
    // gone from the form — replaced by a single "Banking Verification"
    // section (brief section 12). The ID/passport number TEXT fields
    // stay (checked separately below), only the old upload
    // requirement changed.
    for (const heading of ["Personal Details", "Contact Details", "Residential Details", "Applicant Type", "Affiliate Information", "Banking Verification", "Declarations"]) {
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Identity Verification" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Proof of Residence" })).toHaveCount(0);
    // Pre-filled from the account, per brief section 7.
    await expect(page.locator("#firstName")).toHaveValue("Thandiwe");
    await expect(page.locator("#contactEmail")).toHaveValue("thandiwe@example.com");
  });

  test("declaration checkboxes are never pre-ticked (brief section 31)", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockMyApplication(page, DRAFT_APPLICATION);

    await page.goto("/account/affiliate-application");
    await expect(page.locator("#infoAccurateConfirmed")).not.toBeChecked();
    await expect(page.locator("#termsAccepted")).not.toBeChecked();
  });

  test("selecting South African ID shows the ID number field and hides the passport field", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockMyApplication(page, DRAFT_APPLICATION);

    await page.goto("/account/affiliate-application");
    await expect(page.locator("[data-id-number-field]")).toBeHidden();
    await page.locator("#identityType").selectOption("SA_ID");
    await expect(page.locator("[data-id-number-field]")).toBeVisible();
    await expect(page.locator("[data-passport-number-field]")).toBeHidden();
  });

  test("selecting Business applicant type shows business fields", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockMyApplication(page, DRAFT_APPLICATION);

    await page.goto("/account/affiliate-application");
    await expect(page.locator("[data-business-fields]")).toBeHidden();
    await page.locator("#applicantType").selectOption("BUSINESS");
    await expect(page.locator("[data-business-fields]")).toBeVisible();
  });

  test("Save Draft sends the current form values to the backend", async ({ page }) => {
    await mockLoggedInCustomer(page);
    let savedBody = null;
    // One route handles both GET (initial load) and PATCH (save) for
    // this exact URL — Playwright checks same-URL routes most-recently-
    // registered-first and route.continue() performs a REAL network
    // request rather than falling through to an earlier page.route, so
    // two separate registrations for the same pattern would race/hang
    // against each other (there's no real backend in this project).
    await page.route("**/api/customers/affiliate/application", (route) => {
      if (route.request().method() === "PATCH") {
        savedBody = route.request().postDataJSON();
        return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ application: { ...DRAFT_APPLICATION, nationality: "South African" } }) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ hasApplication: true, application: DRAFT_APPLICATION }) });
    });

    await page.goto("/account/affiliate-application");
    await page.locator("#nationality").fill("South African");
    await page.locator('[data-action="save-affiliate-application-draft"]').click();

    await expect.poll(() => savedBody).not.toBeNull();
    expect(savedBody.nationality).toBe("South African");
    await expect(page.locator("[data-affiliate-application-success]")).toContainText("Draft saved");
  });

  test("Submit Application saves then calls the submit endpoint, and shows the backend's validation message on failure", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await page.route("**/api/customers/affiliate/application", (route) => {
      const body = route.request().method() === "PATCH" ? { application: DRAFT_APPLICATION } : { hasApplication: true, application: DRAFT_APPLICATION };
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope(body) });
    });
    let submitCalled = false;
    await page.route("**/api/customers/affiliate/application/submit", (route) => {
      submitCalled = true;
      return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ success: false, message: "Please upload a Banking Confirmation Letter before submitting." }) });
    });

    await page.goto("/account/affiliate-application");
    await page.locator('#affiliate-application-form button[type="submit"]').click();

    await expect.poll(() => submitCalled).toBe(true);
    await expect(page.locator("[data-affiliate-application-banner]")).toContainText("Banking Confirmation Letter");
  });

  test("uploading a Banking Confirmation Letter without choosing a file shows a clear error, never calls the backend", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockMyApplication(page, DRAFT_APPLICATION);
    let uploadCalled = false;
    await page.route("**/api/customers/affiliate/application/documents", (route) => {
      uploadCalled = true;
      return route.fulfill({ status: 201, contentType: "application/json", body: envelope({ document: {} }) });
    });

    await page.goto("/account/affiliate-application");
    await page.locator('[data-action="upload-affiliate-document"][data-slot="BANKING_CONFIRMATION_LETTER"]').click();

    await expect(page.locator('[data-document-upload-banner="BANKING_CONFIRMATION_LETTER"]')).toContainText("choose a file");
    expect(uploadCalled).toBe(false);
  });

  test("the Banking Confirmation Letter slot has no Document Type select — a file alone is enough to upload (brief section 12: no sub-type choice for this document)", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockMyApplication(page, DRAFT_APPLICATION);
    let uploadRequest = null;
    await page.route("**/api/customers/affiliate/application/documents", (route) => {
      uploadRequest = route.request();
      return route.fulfill({ status: 201, contentType: "application/json", body: envelope({ document: { classification: "MATCH" } }) });
    });

    await page.goto("/account/affiliate-application");
    await expect(page.locator('[data-document-type-select][data-slot="BANKING_CONFIRMATION_LETTER"]')).toHaveCount(0);

    await page.locator('[data-document-file-input][data-slot="BANKING_CONFIRMATION_LETTER"]').setInputFiles({ name: "letter.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
    await page.locator('[data-action="upload-affiliate-document"][data-slot="BANKING_CONFIRMATION_LETTER"]').click();

    await expect.poll(() => uploadRequest).not.toBeNull();
    expect(uploadRequest.headers()["content-type"]).toContain("multipart/form-data");
  });

  test("an ACTION_REQUIRED application shows the admin's reason and re-enables editing", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockMyApplication(page, { ...DRAFT_APPLICATION, status: "ACTION_REQUIRED", actionRequiredReason: "Please upload a clearer ID document.", actionRequiredArea: "IDENTITY_DOCUMENT" });

    await page.goto("/account/affiliate-application");
    await expect(page.getByText("Please upload a clearer ID document.")).toBeVisible();
    await expect(page.locator("#affiliate-application-form")).toBeVisible();
  });

  test("an UNDER_REVIEW application shows a read-only status, no editable form", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockMyApplication(page, { ...DRAFT_APPLICATION, status: "UNDER_REVIEW" });

    await page.goto("/account/affiliate-application");
    await expect(page.getByText("Under Review")).toBeVisible();
    await expect(page.locator("#affiliate-application-form")).toHaveCount(0);
  });

  test("an APPROVED application shows a success status, no editable form", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockMyApplication(page, { ...DRAFT_APPLICATION, status: "APPROVED" });

    await page.goto("/account/affiliate-application");
    await expect(page.getByText("Approved").first()).toBeVisible();
    await expect(page.locator("#affiliate-application-form")).toHaveCount(0);
  });

  test("no application needed (already an active affiliate) shows a clear message, never a blank/broken form", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockMyApplication(page, null);

    await page.goto("/account/affiliate-application");
    await expect(page.getByText("No application is needed")).toBeVisible();
  });
});

test.describe("Admin affiliate application review", () => {
  function mockAdminAuth(page) {
    return page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid" }) }));
  }

  test("the applications list redirects to admin login when not authenticated", async ({ page }) => {
    await page.route("**/api/admin/affiliate-applications**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) }));
    await page.goto("/admin/referrals/applications");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("the applications list shows summary fields only, no identity number anywhere in the HTML", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/affiliate-applications?**", (route) => {
      if (!route.request().url().includes("/affiliate-applications?")) return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ applications: [{ id: "app-1", status: "UNDER_REVIEW", applicantType: "INDIVIDUAL", fullName: "Thandiwe Nkosi", email: "thandiwe@example.com", mobile: "0821234567", city: "Pretoria", province: "Gauteng", submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }], total: 1, page: 1, limit: 20, totalPages: 1 }),
      });
    });

    await page.goto("/admin/referrals/applications");
    await expect(page.getByText("Thandiwe Nkosi")).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain("9001015008088");
  });

  const DETAIL_APPLICATION = {
    id: "app-1",
    status: "UNDER_REVIEW",
    firstName: "Thandiwe",
    middleName: null,
    surname: "Nkosi",
    dateOfBirth: "1990-01-01T00:00:00.000Z",
    nationality: "South African",
    identityType: "SA_ID",
    identityNumberMasked: "*********8088",
    contactEmail: "thandiwe@example.com",
    mobileNumber: "0821234567",
    whatsappNumber: null,
    preferredContactMethod: null,
    addressLine1: "12 Oak Road",
    addressLine2: null,
    suburb: "Sunnyside",
    city: "Pretoria",
    province: "Gauteng",
    postalCode: "0002",
    country: "South Africa",
    applicantType: "INDIVIDUAL",
    businessName: null,
    businessRegistrationNumber: null,
    businessWebsite: null,
    promotionPlan: "Social media.",
    websiteUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    tiktokUrl: null,
    youtubeUrl: null,
    otherPlatform: null,
    audienceSize: null,
    motivation: "Love the brand.",
    infoAccurateConfirmed: true,
    termsAccepted: true,
    termsVersion: "2026-08-27",
    actionRequiredReason: null,
    actionRequiredArea: null,
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    approvedAt: null,
    rejectedAt: null,
    affiliateId: "affiliate-1",
    documents: [
      { id: "doc-1", slot: "IDENTITY", identityDocumentType: "SA_ID", proofOfResidenceType: null, fileName: "id.pdf", mimeType: "application/pdf", fileSizeBytes: 1000, isCurrent: true, classification: "MATCH", classificationReason: "Document type confirmed.", nameMatchResult: "MATCH", addressMatchResult: null, idNumberMatchResult: "MATCH", uploadedAt: new Date().toISOString() },
    ],
  };

  function mockDetail(page) {
    return Promise.all([
      mockAdminAuth(page),
      page.route("**/api/admin/affiliate-applications/app-1", (route) => {
        if (route.request().method() !== "GET") return route.continue();
        return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ application: DETAIL_APPLICATION }) });
      }),
      page.route("**/api/admin/affiliate-applications/app-1/events", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ events: [] }) })),
    ]);
  }

  test("the identity number is masked by default; Reveal fetches and shows the full value", async ({ page }) => {
    await mockDetail(page);
    await page.route("**/api/admin/affiliate-applications/app-1/identity-number", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ identityNumber: "9001015008088" }) })
    );

    await page.goto("/admin/referrals/applications/app-1");
    await expect(page.locator("[data-identity-number-value]")).toHaveText("*********8088");
    await page.locator('[data-action="reveal-identity-number"]').click();
    await expect(page.locator("[data-identity-number-value]")).toHaveText("9001015008088");
  });

  test("Approve calls the approve endpoint for this application", async ({ page }) => {
    await mockDetail(page);
    let approveCalled = false;
    await page.route("**/api/admin/affiliate-applications/app-1/approve", (route) => {
      approveCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ application: { ...DETAIL_APPLICATION, status: "APPROVED" } }) });
    });

    await page.goto("/admin/referrals/applications/app-1");
    await page.locator('[data-action="approve-affiliate-application"]').click();
    await expect.poll(() => approveCalled).toBe(true);
  });

  test("Approve shows the backend's Banking Confirmation Letter guard error and re-enables the buttons (brief section 29)", async ({ page }) => {
    await mockDetail(page);
    await page.route("**/api/admin/affiliate-applications/app-1/approve", (route) =>
      route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ success: false, message: "This application has no current Banking Confirmation Letter. It cannot be approved." }) })
    );

    await page.goto("/admin/referrals/applications/app-1");
    await page.locator('[data-action="approve-affiliate-application"]').click();

    await expect(page.locator("[data-affiliate-application-decision-banner]")).toContainText("Banking Confirmation Letter");
    await expect(page.locator('[data-action="approve-affiliate-application"]')).toBeEnabled();
  });

  test("Reject without a reason shows an error and never calls the backend", async ({ page }) => {
    await mockDetail(page);
    let rejectCalled = false;
    await page.route("**/api/admin/affiliate-applications/app-1/reject", (route) => {
      rejectCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ application: DETAIL_APPLICATION }) });
    });

    await page.goto("/admin/referrals/applications/app-1");
    await page.locator('[data-action="reject-affiliate-application"]').click();
    await expect(page.locator("[data-affiliate-application-decision-banner]")).toContainText("reason is required");
    expect(rejectCalled).toBe(false);
  });

  test("Request Correction with a reason and area calls the correction endpoint with both", async ({ page }) => {
    await mockDetail(page);
    let correctionBody = null;
    await page.route("**/api/admin/affiliate-applications/app-1/request-correction", (route) => {
      correctionBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ application: { ...DETAIL_APPLICATION, status: "ACTION_REQUIRED" } }) });
    });

    await page.goto("/admin/referrals/applications/app-1");
    await page.locator("#decisionReason").fill("Please re-upload a clearer ID document.");
    await page.locator("#correctionArea").selectOption("IDENTITY_DOCUMENT");
    await page.locator('[data-action="request-affiliate-application-correction"]').click();

    await expect.poll(() => correctionBody).not.toBeNull();
    expect(correctionBody.reason).toContain("clearer ID");
    expect(correctionBody.area).toBe("IDENTITY_DOCUMENT");
  });

  test("the correction area select offers Banking Confirmation Letter alongside the historical Identity/Proof of Residence areas (brief section 12/60: additive, nothing removed)", async ({ page }) => {
    await mockDetail(page);
    await page.goto("/admin/referrals/applications/app-1");

    const values = await page.locator("#correctionArea option").evaluateAll((options) => options.map((o) => o.value));
    expect(values).toEqual(expect.arrayContaining(["PERSONAL_DETAILS", "BANKING_CONFIRMATION_LETTER", "IDENTITY_DOCUMENT", "PROOF_OF_RESIDENCE", "OTHER"]));
  });

  test("a Banking Confirmation Letter document shows on the admin detail page with its classification and a working Secure View button, with no stray document-type sub-label", async ({ page }) => {
    await mockAdminAuth(page);
    const applicationWithLetter = {
      ...DETAIL_APPLICATION,
      documents: [
        { id: "doc-2", slot: "BANKING_CONFIRMATION_LETTER", identityDocumentType: null, proofOfResidenceType: null, fileName: "letter.pdf", mimeType: "application/pdf", fileSizeBytes: 2000, isCurrent: true, classification: "MATCH", classificationReason: "Document type confirmed. Detected a recognised South African bank name, confirmation or proof of account wording.", nameMatchResult: "MATCH", addressMatchResult: null, idNumberMatchResult: null, uploadedAt: new Date().toISOString() },
      ],
    };
    await page.route("**/api/admin/affiliate-applications/app-1", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ application: applicationWithLetter }) });
    });
    await page.route("**/api/admin/affiliate-applications/app-1/events", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ events: [] }) }));
    let signedUrlCalled = false;
    await page.route("**/api/admin/affiliate-applications/app-1/documents/doc-2/signed-url", (route) => {
      signedUrlCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ signedUrl: "https://storage.example.invalid/signed/doc-2?token=abc" }) });
    });

    await page.goto("/admin/referrals/applications/app-1");
    const documentsCard = page.locator(".order-confirmation__card", { has: page.getByRole("heading", { name: "Documents" }) });
    await expect(documentsCard.getByText("Banking Confirmation Letter")).toBeVisible();
    await expect(documentsCard.getByText("Document type confirmed").first()).toBeVisible();
    // No leftover "identityDocumentType"/"proofOfResidenceType" label
    // fragment (both null for this slot) rendered as an empty/odd
    // prefix before the classification text.
    const html = await page.content();
    expect(html).not.toContain(": Document type confirmed");

    await Promise.all([page.waitForEvent("popup"), page.locator('[data-action="view-affiliate-document"]').click()]);
    await expect.poll(() => signedUrlCalled).toBe(true);
  });

  test("View document generates a fresh signed URL and opens it", async ({ page, context }) => {
    await mockDetail(page);
    let signedUrlCalled = false;
    const signedUrl = "https://storage.example.invalid/signed/doc-1?token=abc";
    await page.route("**/api/admin/affiliate-applications/app-1/documents/doc-1/signed-url", (route) => {
      signedUrlCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ signedUrl }) });
    });
    // The popup navigates to a fake external storage domain — mocked so
    // the navigation itself succeeds (this test only cares that the
    // correct signed URL was requested and opened, not that a real
    // storage provider is reachable).
    await context.route(signedUrl, (route) => route.fulfill({ status: 200, contentType: "text/plain", body: "fake document content" }));

    await page.goto("/admin/referrals/applications/app-1");
    const [popup] = await Promise.all([context.waitForEvent("page"), page.locator('[data-action="view-affiliate-document"]').click()]);
    await expect.poll(() => signedUrlCalled).toBe(true);
    await popup.waitForLoadState();
    expect(popup.url()).toContain("signed/doc-1");
  });
});
