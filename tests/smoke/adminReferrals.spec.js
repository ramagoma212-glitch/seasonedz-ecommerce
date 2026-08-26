// Version 7, Milestone 172B.3: admin UI for Seasonedz's own affiliate/
// referral programme. Nothing here is public yet — no referral
// discount, no commission, no ?ref capture (all Milestone 172B.4+) —
// this file only covers the admin-only foundation this milestone
// actually builds. Every "logged in" scenario is mocked via
// page.route(), matching adminAffiliate.spec.js's own established
// discipline (172B) — this project has no precedent for driving a
// real authenticated admin session in Playwright.
import { test, expect } from "@playwright/test";

const MOCK_SETTINGS = {
  id: "settings-1",
  defaultCommissionRate: 7,
  defaultReferralDiscountRate: 5,
  attributionWindowDays: 30,
  commissionValidationDays: 30,
  minimumPayoutAmount: 500,
  payoutDayOfMonth: 15,
  isProgrammeActive: true,
  updatedByAdminUserId: null,
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

const MOCK_AFFILIATE = {
  id: "aff-1",
  customerId: null,
  name: "Jane Doe",
  email: "jane@example.com",
  phone: null,
  referralCode: "jane-doe",
  status: "PENDING",
  commissionRateOverride: null,
  discountRateOverride: null,
  approvedAt: null,
  notes: null,
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

async function mockAdminAuth(page) {
  await page.route("**/api/admin/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid" }) })
  );
}

async function mockOverview(page, counts = { totalAffiliates: 0, pendingAffiliates: 0, activeAffiliates: 0, suspendedAffiliates: 0, rejectedAffiliates: 0 }) {
  await page.route("**/api/admin/referrals/overview", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope(counts) }));
}

async function mockSettings(page, settings = MOCK_SETTINGS) {
  await page.route("**/api/admin/referrals/settings", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: envelope(settings) });
    return route.continue();
  });
}

async function mockAffiliateList(page, affiliates = [MOCK_AFFILIATE]) {
  const body = envelope({ affiliates, total: affiliates.length, page: 1, limit: 20, totalPages: 1 });
  await page.route("**/api/admin/referrals/affiliates?*", (route) => (route.request().method() === "GET" ? route.fulfill({ status: 200, contentType: "application/json", body }) : route.continue()));
  await page.route("**/api/admin/referrals/affiliates", (route) => (route.request().method() === "GET" ? route.fulfill({ status: 200, contentType: "application/json", body }) : route.continue()));
}

test.describe("Admin nav (Milestone 172B.3)", () => {
  test("the Referrals nav link is present and points at /admin/referrals, separate from the dormant Affiliate link", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOverview(page);
    await mockSettings(page);
    await page.goto("/admin/referrals");

    const referralsLink = page.locator(".admin-nav a", { hasText: "Referrals" });
    await expect(referralsLink).toBeVisible();
    await expect(referralsLink).toHaveAttribute("href", "/admin/referrals");

    const affiliateLink = page.locator(".admin-nav a", { hasText: "Affiliate" }).first();
    await expect(affiliateLink).toHaveAttribute("href", "/admin/affiliate");
  });
});

test.describe("Admin referrals routes are noindex and not publicly reachable (Milestone 172B.3)", () => {
  test("/admin/referrals is noindex", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOverview(page);
    await mockSettings(page);
    await page.goto("/admin/referrals");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
  });

  test("/admin/referrals requires admin auth — a 401 redirects to admin login", async ({ page }) => {
    // The overview page fetches both /overview and /settings in
    // parallel (Promise.all) — both must return the 401 explicitly.
    // Leaving one unmocked lets it fall through to a real network
    // request instead, racing against the mocked 401 and making the
    // outcome timing-dependent (this passed locally but failed in CI
    // for exactly that reason before this fix).
    const unauthorised = (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) });
    await page.route("**/api/admin/referrals/overview", unauthorised);
    await page.route("**/api/admin/referrals/settings", unauthorised);
    await page.goto("/admin/referrals");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("/admin/referrals/affiliates/new requires admin auth", async ({ page }) => {
    await page.route("**/api/admin/auth/me", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) })
    );
    await page.goto("/admin/referrals/affiliates/new");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("Referrals overview (Milestone 172B.3)", () => {
  test("shows structural affiliate counts and the current programme defaults — 7%, 5%, R500, 30/30 days, day 15 — all from the mocked backend response", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOverview(page, { totalAffiliates: 3, pendingAffiliates: 1, activeAffiliates: 1, suspendedAffiliates: 1, rejectedAffiliates: 0 });
    await mockSettings(page);
    await page.goto("/admin/referrals");

    await expect(page.locator(".admin-cards").first()).toContainText("3");
    await expect(page.locator("body")).toContainText("7%");
    await expect(page.locator("body")).toContainText("5%");
    await expect(page.locator("body")).toContainText("30 days");
    await expect(page.locator("body")).toContainText("R500.00");
    await expect(page.locator("body")).toContainText("Day 15");
  });

  test("never fabricates clicks, orders, commission or sales — only the structural counts appear", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOverview(page);
    await mockSettings(page);
    await page.goto("/admin/referrals");
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.toLowerCase()).not.toContain("total sales");
    expect(bodyText.toLowerCase()).not.toContain("total clicks");
  });
});

test.describe("Referral affiliates list (Milestone 172B.3)", () => {
  test("renders the mocked affiliate with its labelled fields", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, [MOCK_AFFILIATE]);
    await page.goto("/admin/referrals/affiliates");

    const row = page.locator('[data-affiliate-row="aff-1"]');
    await expect(row).toContainText("Jane Doe");
    await expect(row).toContainText("jane@example.com");
    await expect(row).toContainText("jane-doe");
    await expect(row.getByText("Approve")).toBeVisible();
    await expect(row.getByText("Reject")).toBeVisible();
  });

  test("shows an empty state with zero affiliates", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, []);
    await page.goto("/admin/referrals/affiliates");
    await expect(page.locator(".admin-empty")).toContainText("No affiliates yet");
  });

  test("approving a PENDING affiliate calls the approve endpoint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, [MOCK_AFFILIATE]);
    let approveCalled = false;
    await page.route("**/api/admin/referrals/affiliates/aff-1/approve", (route) => {
      approveCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...MOCK_AFFILIATE, status: "ACTIVE" }) });
    });

    await page.goto("/admin/referrals/affiliates");
    await page.locator('[data-action="approve-affiliate"]').click();
    await page.waitForTimeout(300);
    expect(approveCalled).toBe(true);
  });

  test("rejecting a PENDING affiliate calls the reject endpoint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, [MOCK_AFFILIATE]);
    let rejectCalled = false;
    await page.route("**/api/admin/referrals/affiliates/aff-1/reject", (route) => {
      rejectCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...MOCK_AFFILIATE, status: "REJECTED" }) });
    });

    await page.goto("/admin/referrals/affiliates");
    await page.locator('[data-action="reject-affiliate"]').click();
    await page.waitForTimeout(300);
    expect(rejectCalled).toBe(true);
  });

  test("suspending an ACTIVE affiliate calls the suspend endpoint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, [{ ...MOCK_AFFILIATE, status: "ACTIVE" }]);
    let suspendCalled = false;
    await page.route("**/api/admin/referrals/affiliates/aff-1/suspend", (route) => {
      suspendCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...MOCK_AFFILIATE, status: "SUSPENDED" }) });
    });

    await page.goto("/admin/referrals/affiliates");
    await page.locator('[data-action="suspend-affiliate"]').click();
    await page.waitForTimeout(300);
    expect(suspendCalled).toBe(true);
  });

  test("reactivating a SUSPENDED affiliate calls the reactivate endpoint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, [{ ...MOCK_AFFILIATE, status: "SUSPENDED" }]);
    let reactivateCalled = false;
    await page.route("**/api/admin/referrals/affiliates/aff-1/reactivate", (route) => {
      reactivateCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...MOCK_AFFILIATE, status: "ACTIVE" }) });
    });

    await page.goto("/admin/referrals/affiliates");
    await page.locator('[data-action="reactivate-affiliate"]').click();
    await page.waitForTimeout(300);
    expect(reactivateCalled).toBe(true);
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAffiliateList(page, [MOCK_AFFILIATE]);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/admin/referrals/affiliates");
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasOverflow).toBe(false);
  });
});

test.describe("Referral affiliate create form (Milestone 172B.3)", () => {
  test("shows the required fields and rejects an invalid email client-side before calling the API", async ({ page }) => {
    await mockAdminAuth(page);
    let createCalled = false;
    await page.route("**/api/admin/referrals/affiliates", (route) => {
      if (route.request().method() === "POST") createCalled = true;
      return route.continue();
    });

    await page.goto("/admin/referrals/affiliates/new");
    await expect(page.locator('label[for="referralAffiliateName"]')).toContainText("Name");
    await expect(page.locator('label[for="referralAffiliateEmail"]')).toContainText("Email");
    await expect(page.locator('label[for="referralAffiliateCode"]')).toContainText("Referral Code");

    await page.locator("#referralAffiliateName").fill("Jane Doe");
    await page.locator("#referralAffiliateEmail").fill("not-an-email");
    await page.locator('[data-admin-referral-affiliate-form] button[type="submit"]').click();
    await page.waitForTimeout(200);

    await expect(page.locator("[data-admin-referral-affiliate-form-banner]")).toContainText("email");
    expect(createCalled).toBe(false);
  });

  test("a valid submission creates the affiliate and navigates to its edit page", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/referrals/affiliates", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({ status: 201, contentType: "application/json", body: envelope(MOCK_AFFILIATE) });
    });
    await page.route("**/api/admin/referrals/affiliates/aff-1", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope(MOCK_AFFILIATE) });
    });

    await page.goto("/admin/referrals/affiliates/new");
    await page.locator("#referralAffiliateName").fill("Jane Doe");
    await page.locator("#referralAffiliateEmail").fill("jane@example.com");
    await page.locator('[data-admin-referral-affiliate-form] button[type="submit"]').click();

    await expect(page).toHaveURL(/\/admin\/referrals\/affiliates\/aff-1\/edit/);
  });
});

test.describe("Referral affiliate edit form (Milestone 172B.3)", () => {
  test("loads the existing affiliate's fields", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/referrals/affiliates/aff-1", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope(MOCK_AFFILIATE) });
    });

    await page.goto("/admin/referrals/affiliates/aff-1/edit");
    await expect(page.locator("#referralAffiliateName")).toHaveValue("Jane Doe");
    await expect(page.locator("#referralAffiliateEmail")).toHaveValue("jane@example.com");
    await expect(page.locator("#referralAffiliateCode")).toHaveValue("jane-doe");
  });
});

test.describe("Referral programme settings (Milestone 172B.3)", () => {
  test("shows every editable field, pre-filled from the actual backend settings — 7%, 5%, 30, 30, R500, 15", async ({ page }) => {
    await mockAdminAuth(page);
    await mockSettings(page);
    await page.goto("/admin/referrals/settings");

    await expect(page.locator("#referralSettingsCommissionRate")).toHaveValue("7");
    await expect(page.locator("#referralSettingsDiscountRate")).toHaveValue("5");
    await expect(page.locator("#referralSettingsAttributionWindow")).toHaveValue("30");
    await expect(page.locator("#referralSettingsValidationDays")).toHaveValue("30");
    await expect(page.locator("#referralSettingsMinimumPayout")).toHaveValue("500");
    await expect(page.locator("#referralSettingsPayoutDay")).toHaveValue("15");
    await expect(page.locator("#referralSettingsProgrammeActive")).toBeChecked();
  });

  test("explains that changing a default never alters historical commission records", async ({ page }) => {
    await mockAdminAuth(page);
    await mockSettings(page);
    await page.goto("/admin/referrals/settings");
    await expect(page.locator("body")).toContainText("never alters a historical commission record");
  });

  test("rejects a commission rate outside 0-50 client-side before calling the API", async ({ page }) => {
    await mockAdminAuth(page);
    await mockSettings(page);
    let patchCalled = false;
    await page.route("**/api/admin/referrals/settings", (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      patchCalled = true;
      return route.continue();
    });

    await page.goto("/admin/referrals/settings");
    await page.locator("#referralSettingsCommissionRate").fill("500");
    await page.locator('[data-admin-referral-settings-form] button[type="submit"]').click();
    await page.waitForTimeout(200);

    await expect(page.locator("[data-admin-referral-settings-banner]")).toBeVisible();
    expect(patchCalled).toBe(false);
  });

  test("a valid settings change is submitted to the backend", async ({ page }) => {
    await mockAdminAuth(page);
    await mockSettings(page);
    let patchBody = null;
    await page.route("**/api/admin/referrals/settings", (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      patchBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...MOCK_SETTINGS, defaultCommissionRate: 8 }) });
    });

    await page.goto("/admin/referrals/settings");
    await page.locator("#referralSettingsCommissionRate").fill("8");
    await page.locator('[data-admin-referral-settings-form] button[type="submit"]').click();
    await page.waitForTimeout(300);

    expect(patchBody?.defaultCommissionRate).toBe(8);
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await mockAdminAuth(page);
    await mockSettings(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/admin/referrals/settings");
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasOverflow).toBe(false);
  });
});
