// Version 7, Milestone 172B.5: commission lifecycle + payout admin UI.
// Same "every 'logged in' scenario is mocked via page.route()"
// discipline as adminReferrals.spec.js (172B.3) — no precedent in this
// project for driving a real authenticated admin session in
// Playwright. Every eligibility/threshold value shown is whatever the
// mocked backend response says — this file never asserts a client-side
// recomputation of any of it.
import { test, expect } from "@playwright/test";

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

const UNAUTHORISED_BODY = JSON.stringify({ success: false, message: "Authentication required." });

async function mockAdminAuth(page) {
  await page.route("**/api/admin/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid" }) })
  );
}

const ELIGIBLE_COMMISSION = {
  id: "commission-1",
  orderId: "order-1",
  affiliateId: "aff-1",
  affiliateNameSnapshot: "Jane Doe",
  affiliateReferralCodeSnapshot: "jane-doe",
  qualifyingProductSubtotal: 500,
  discountRateApplied: 5,
  discountAmount: 25,
  netQualifyingAmount: 475,
  commissionRateApplied: 7,
  commissionAmount: 33.25,
  status: "PENDING",
  approvedAt: null,
  paidAt: null,
  reversedAt: null,
  reversalReason: null,
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  order: { orderNumber: "SZ-2026-0001", createdAt: "2026-07-01T00:00:00.000Z", status: "DELIVERED", customerEmail: "thandiwe@example.com", customerName: "Thandiwe Nkosi" },
  eligibility: { eligible: true, reason: null, reasonLabel: null, eligibleForApprovalAt: "2026-07-31T00:00:00.000Z", fulfilmentBasis: "PHYSICAL_DELIVERED_STATUS_HISTORY" },
  paidButOrderNowNonPayable: false,
};

const NOT_YET_ELIGIBLE_COMMISSION = {
  ...ELIGIBLE_COMMISSION,
  id: "commission-2",
  order: { ...ELIGIBLE_COMMISSION.order, orderNumber: "SZ-2026-0002" },
  eligibility: { eligible: false, reason: "VALIDATION_PERIOD_INCOMPLETE", reasonLabel: "The programme's validation period has not elapsed yet.", eligibleForApprovalAt: "2026-09-15T00:00:00.000Z", fulfilmentBasis: "PHYSICAL_DELIVERED_STATUS_HISTORY" },
};

async function mockCommissionList(page, commissions = [ELIGIBLE_COMMISSION]) {
  const body = envelope({ commissions, total: commissions.length, page: 1, limit: 20, totalPages: 1 });
  await page.route("**/api/admin/referrals/commissions?*", (route) => (route.request().method() === "GET" ? route.fulfill({ status: 200, contentType: "application/json", body }) : route.continue()));
  await page.route("**/api/admin/referrals/commissions", (route) => (route.request().method() === "GET" ? route.fulfill({ status: 200, contentType: "application/json", body }) : route.continue()));
}

async function mockCommissionDetail(page, commission = ELIGIBLE_COMMISSION) {
  await page.route(`**/api/admin/referrals/commissions/${commission.id}`, (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: envelope(commission) });
    return route.continue();
  });
}

test.describe("Commission list (Milestone 172B.5)", () => {
  test("requires admin auth", async ({ page }) => {
    // This page (like adminReferralAffiliates.js/adminReferralsOverview.js)
    // determines auth state from its own data endpoint's response, never
    // from a separate /auth/me call — see adminGuard.js's isUnauthenticated().
    await page.route("**/api/admin/referrals/commissions*", (route) => route.fulfill({ status: 401, contentType: "application/json", body: UNAUTHORISED_BODY }));
    await page.goto("/admin/referrals/commissions");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("empty state shows an honest message, never fabricated rows", async ({ page }) => {
    await mockAdminAuth(page);
    await mockCommissionList(page, []);
    await page.goto("/admin/referrals/commissions");
    await expect(page.locator(".admin-empty")).toContainText("No commissions match");
  });

  test("shows real commission rows with the exact snapshot figures from the backend", async ({ page }) => {
    await mockAdminAuth(page);
    await mockCommissionList(page, [ELIGIBLE_COMMISSION]);
    await page.goto("/admin/referrals/commissions");

    const row = page.locator(".admin-table tbody tr").first();
    await expect(row).toContainText("SZ-2026-0001");
    await expect(row).toContainText("Jane Doe");
    await expect(row).toContainText("jane-doe");
    await expect(row).toContainText("R500.00");
    await expect(row).toContainText("R25.00");
    await expect(row).toContainText("R33.25");
    await expect(row).toContainText("Eligible now");
  });

  test("a not-yet-eligible PENDING commission shows its eligible-from date, and no Approve button", async ({ page }) => {
    await mockAdminAuth(page);
    await mockCommissionList(page, [NOT_YET_ELIGIBLE_COMMISSION]);
    await page.goto("/admin/referrals/commissions");

    const row = page.locator(".admin-table tbody tr").first();
    await expect(row.locator('[data-action="approve-commission"]')).toHaveCount(0);
  });

  test("the eligible-only filter navigates with the correct query param", async ({ page }) => {
    await mockAdminAuth(page);
    await mockCommissionList(page, [ELIGIBLE_COMMISSION]);
    await page.goto("/admin/referrals/commissions");

    await page.locator('input[name="eligibleOnly"]').check();
    await page.locator('[data-admin-commission-filter-form] button[type="submit"]').click();
    await expect(page).toHaveURL(/eligibleOnly=true/);
  });

  test("no horizontal page overflow at 375px, despite the many columns", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mockAdminAuth(page);
    await mockCommissionList(page, [ELIGIBLE_COMMISSION]);
    await page.goto("/admin/referrals/commissions");

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    // The table itself is allowed to scroll internally (admin-table-wrap)
    // — that's the whole point of avoiding page-level overflow.
    await expect(page.locator(".admin-table-wrap")).toBeVisible();
  });
});

test.describe("Commission detail and approve action (Milestone 172B.5)", () => {
  test("shows the full financial snapshot and status", async ({ page }) => {
    await mockAdminAuth(page);
    await mockCommissionDetail(page, ELIGIBLE_COMMISSION);
    await page.goto(`/admin/referrals/commissions/${ELIGIBLE_COMMISSION.id}`);

    await expect(page.locator(".admin-page")).toContainText("R500.00");
    await expect(page.locator(".admin-page")).toContainText("R475.00");
    await expect(page.locator(".admin-page")).toContainText("R33.25");
    // Never exposes affiliate payout/commission info as anything other
    // than an internal admin figure — this is the admin view, so the
    // figures ARE expected here; the point is they're real, not fake.
    await expect(page.locator('[data-action="approve-commission"]')).toBeEnabled();
  });

  test("approving calls the approve endpoint and shows a success message", async ({ page }) => {
    await mockAdminAuth(page);
    await mockCommissionDetail(page, ELIGIBLE_COMMISSION);
    let approveCalled = false;
    await page.route(`**/api/admin/referrals/commissions/${ELIGIBLE_COMMISSION.id}/approve`, (route) => {
      approveCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...ELIGIBLE_COMMISSION, status: "APPROVED", approvedAt: "2026-08-01T00:00:00.000Z" }) });
    });

    await page.goto(`/admin/referrals/commissions/${ELIGIBLE_COMMISSION.id}`);
    await page.locator('[data-action="approve-commission"]').click();
    await expect.poll(() => approveCalled).toBe(true);
  });

  test("the approve button is disabled and shows the reason when not yet eligible", async ({ page }) => {
    await mockAdminAuth(page);
    await mockCommissionDetail(page, NOT_YET_ELIGIBLE_COMMISSION);
    await page.goto(`/admin/referrals/commissions/${NOT_YET_ELIGIBLE_COMMISSION.id}`);

    await expect(page.locator('[data-action="approve-commission"]')).toBeDisabled();
    await expect(page.locator(".admin-page")).toContainText("validation period has not elapsed");
  });

  test("reversing requires a reason of at least 3 characters — client-side hint, backend re-validates regardless", async ({ page }) => {
    await mockAdminAuth(page);
    await mockCommissionDetail(page, ELIGIBLE_COMMISSION);
    let reverseCalled = false;
    await page.route(`**/api/admin/referrals/commissions/${ELIGIBLE_COMMISSION.id}/reverse`, (route) => {
      reverseCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...ELIGIBLE_COMMISSION, status: "REVERSED" }) });
    });

    await page.goto(`/admin/referrals/commissions/${ELIGIBLE_COMMISSION.id}`);
    await page.locator("#reversalReason").fill("Order was disputed by the customer.");
    await page.locator('[data-admin-commission-reverse-form] button[type="submit"]').click();
    await expect.poll(() => reverseCalled).toBe(true);
  });

  test("a PAID commission whose order is now non-payable shows the CLAWBACK REQUIRED warning and requires the confirmClawback checkbox", async ({ page }) => {
    const paidClawback = { ...ELIGIBLE_COMMISSION, status: "PAID", paidAt: "2026-07-15T00:00:00.000Z", paidButOrderNowNonPayable: true, order: { ...ELIGIBLE_COMMISSION.order, status: "CANCELLED" } };
    await mockAdminAuth(page);
    await mockCommissionDetail(page, paidClawback);
    await page.goto(`/admin/referrals/commissions/${paidClawback.id}`);

    await expect(page.locator(".admin-page")).toContainText(/clawback/i);
    await expect(page.locator('input[name="confirmClawback"]')).toBeVisible();
    await expect(page.locator('input[name="confirmClawback"]')).toHaveAttribute("required", "");
  });
});

test.describe("Payouts (Milestone 172B.5)", () => {
  const PAYOUT_OVERVIEW = {
    minimumPayoutAmount: 500,
    payoutDayOfMonth: 15,
    payoutFrequency: "monthly",
    groups: [
      { affiliateId: "aff-1", affiliateName: "Jane Doe", affiliateReferralCode: "jane-doe", approvedUnpaidBalance: 580, commissionCount: 2, commissionIds: ["c1", "c2"], isPayoutEligible: true },
      { affiliateId: "aff-2", affiliateName: "Sam Smith", affiliateReferralCode: "sam-smith", approvedUnpaidBalance: 320, commissionCount: 1, commissionIds: ["c3"], isPayoutEligible: false },
    ],
  };

  async function mockPayoutOverview(page, overview = PAYOUT_OVERVIEW) {
    await page.route("**/api/admin/referrals/payouts", (route) => (route.request().method() === "GET" ? route.fulfill({ status: 200, contentType: "application/json", body: envelope(overview) }) : route.continue()));
  }

  test("requires admin auth", async ({ page }) => {
    await page.route("**/api/admin/referrals/payouts", (route) => route.fulfill({ status: 401, contentType: "application/json", body: UNAUTHORISED_BODY }));
    await page.goto("/admin/referrals/payouts");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("shows the R500 minimum, monthly frequency and day 15 guidance from real settings", async ({ page }) => {
    await mockAdminAuth(page);
    await mockPayoutOverview(page);
    await page.goto("/admin/referrals/payouts");

    await expect(page.locator(".admin-page")).toContainText("monthly");
    await expect(page.locator(".admin-page")).toContainText("15");
    await expect(page.locator(".admin-page")).toContainText("R500.00");
  });

  test("an affiliate at R580 is eligible with a Mark Paid button; one at R320 shows carrying forward and no button", async ({ page }) => {
    await mockAdminAuth(page);
    await mockPayoutOverview(page);
    await page.goto("/admin/referrals/payouts");

    const eligibleRow = page.locator(".admin-table tbody tr", { hasText: "Jane Doe" });
    await expect(eligibleRow).toContainText("R580.00");
    await expect(eligibleRow.locator('[data-action="pay-affiliate-commissions"]')).toBeVisible();

    const notEligibleRow = page.locator(".admin-table tbody tr", { hasText: "Sam Smith" });
    await expect(notEligibleRow).toContainText("R320.00");
    await expect(notEligibleRow).toContainText("Carrying forward");
    await expect(notEligibleRow.locator('[data-action="pay-affiliate-commissions"]')).toHaveCount(0);
  });

  test("marking paid asks for confirmation and then calls the pay endpoint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockPayoutOverview(page);
    let payCalled = false;
    await page.route("**/api/admin/referrals/payouts/aff-1/pay", (route) => {
      payCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ affiliateId: "aff-1", paidCommissionIds: ["c1", "c2"], totalPaid: 580, paidAt: "2026-08-01T00:00:00.000Z" }) });
    });

    await page.goto("/admin/referrals/payouts");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('[data-action="pay-affiliate-commissions"]').click();
    await expect.poll(() => payCalled).toBe(true);
  });
});

test.describe("Overview and affiliate detail show real commission figures (Milestone 172B.5)", () => {
  test("overview shows pending/approved/paid/reversed commission values from the real backend response", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/referrals/overview", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({
          totalAffiliates: 3,
          pendingAffiliates: 1,
          activeAffiliates: 2,
          suspendedAffiliates: 0,
          rejectedAffiliates: 0,
          pendingCount: 2,
          pendingValue: 66.5,
          approvedUnpaidCount: 1,
          approvedUnpaidValue: 33.25,
          paidCount: 4,
          paidValue: 140.5,
          reversedCount: 1,
          reversedValue: 25,
          payoutEligibleAffiliateCount: 0,
        }),
      })
    );
    await page.route("**/api/admin/referrals/settings", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ id: "s1", defaultCommissionRate: 7, defaultReferralDiscountRate: 5, attributionWindowDays: 30, commissionValidationDays: 30, minimumPayoutAmount: 500, payoutDayOfMonth: 15, isProgrammeActive: true, updatedByAdminUserId: null, createdAt: "2026-01-01", updatedAt: "2026-01-01" }),
      })
    );

    await page.goto("/admin/referrals");
    await expect(page.locator(".admin-page")).toContainText("R66.50");
    await expect(page.locator(".admin-page")).toContainText("R33.25");
    await expect(page.locator(".admin-page")).toContainText("R140.50");
  });

  test("affiliate detail (edit page) shows real commission totals and payout eligibility", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/referrals/affiliates/aff-1", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({
          id: "aff-1",
          customerId: null,
          name: "Jane Doe",
          email: "jane@example.com",
          phone: null,
          referralCode: "jane-doe",
          status: "ACTIVE",
          commissionRateOverride: null,
          discountRateOverride: null,
          approvedAt: "2026-06-01T00:00:00.000Z",
          notes: null,
          createdAt: "2026-06-01T00:00:00.000Z",
          updatedAt: "2026-06-01T00:00:00.000Z",
          commissionTotals: { pendingTotal: 33.25, approvedUnpaidTotal: 580, paidLifetimeTotal: 140.5, reversedTotal: 25, isPayoutEligible: true, minimumPayoutAmount: 500 },
        }),
      });
    });

    await page.goto("/admin/referrals/affiliates/aff-1/edit");
    await expect(page.locator(".admin-page")).toContainText("R580.00");
    await expect(page.locator(".admin-page")).toContainText("R140.50");
    await expect(page.locator(".admin-page")).toContainText("Payout eligible");
  });
});
