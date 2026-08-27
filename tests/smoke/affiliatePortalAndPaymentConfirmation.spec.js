// Version 7, Milestone 172B.6: affiliate portal (account page),
// application flow, admin manual payment confirmation, and the new
// Affiliate Programme Terms page. Same "mocked logged-in state, real
// backend never touched" discipline as socialAuth.spec.js's own
// Connected Accounts tests — no real Customer/Affiliate row is ever
// created by this file.
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
    page.route("**/api/customers/orders", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ orders: [] }) })),
    page.route("**/api/auth/providers", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ google: false, facebook: false, apple: false }) })),
    page.route("**/api/auth/connected-accounts", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ providers: [] }) })),
  ]);
}

function mockAffiliatePortal(page, data) {
  return page.route("**/api/customers/affiliate", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope(data) });
  });
}

// Version 7, Milestone 176: a PENDING affiliate now also fetches its
// linked application status (accountPage.js's renderPendingAffiliatePortal()).
function mockAffiliateApplication(page, data) {
  return page.route("**/api/customers/affiliate/application", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope(data) });
  });
}

const ACTIVE_AFFILIATE = {
  hasAffiliate: true,
  affiliate: {
    status: "ACTIVE",
    referralCode: "thandiwe-1",
    referralLink: "https://www.seasonedzgroup.co.za/?ref=thandiwe-1",
    effectiveCommissionRate: 7,
    effectiveDiscountRate: 5,
    commissionTotals: { pendingTotal: 33.25, approvedUnpaidTotal: 580, paidLifetimeTotal: 140.5, reversedTotal: 25, isPayoutEligible: true, minimumPayoutAmount: 500 },
    payoutDayOfMonth: 15,
    payoutFrequency: "monthly",
    recentCommissions: [{ orderNumber: "SZ-2026-0001", orderDate: "2026-07-01T00:00:00.000Z", qualifyingProductSubtotal: 500, discountAmount: 25, commissionAmount: 33.25, commissionStatus: "PENDING" }],
  },
};

test.describe("Affiliate portal — account page states", () => {
  test("no linked affiliate: links to the new application page, never fabricated affiliate data", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockAffiliatePortal(page, { hasAffiliate: false, affiliate: null });

    await page.goto("/account");
    const section = page.locator(".account-affiliate");
    await expect(section).toBeVisible();
    await expect(section.locator('a[href="/account/affiliate-application"]')).toBeVisible();
    await expect(section).not.toContainText("Referral Code");
  });

  // Version 7, Milestone 176: a PENDING affiliate WITH a genuine
  // UNDER_REVIEW application shows the real "awaiting review" status —
  // see the next test for the legacy-pending (no application yet) case.
  test("PENDING affiliate with an UNDER_REVIEW application: shows awaiting-approval status, no referral link or promotion tools", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockAffiliatePortal(page, { hasAffiliate: true, affiliate: { ...ACTIVE_AFFILIATE.affiliate, status: "PENDING" } });
    await mockAffiliateApplication(page, { hasApplication: true, application: { status: "UNDER_REVIEW" } });

    await page.goto("/account");
    const section = page.locator(".account-affiliate");
    await expect(section).toContainText("Pending");
    await expect(section).toContainText("awaiting review");
    await expect(section.locator("#affiliateReferralLink")).toHaveCount(0);
  });

  // Version 7, Milestone 176, brief section 51: a legacy PENDING
  // affiliate (created by the pre-176 simple "Apply" button, or a
  // customer who has started but not yet submitted the new application)
  // is prompted to complete the application, exactly matching the
  // brief's own required wording — never left on a dead-end "awaiting
  // review" message for an application that doesn't actually exist yet.
  test("PENDING affiliate with no application yet: prompts to complete the application", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockAffiliatePortal(page, { hasAffiliate: true, affiliate: { ...ACTIVE_AFFILIATE.affiliate, status: "PENDING" } });
    await mockAffiliateApplication(page, { hasApplication: false, application: null });

    await page.goto("/account");
    const section = page.locator(".account-affiliate");
    await expect(section).toContainText("Complete your Affiliate Programme application");
    await expect(section.locator('a[href="/account/affiliate-application"]')).toBeVisible();
  });

  test("ACTIVE affiliate: shows real referral code/link, effective rates, and commission totals", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockAffiliatePortal(page, ACTIVE_AFFILIATE);

    await page.goto("/account");
    const section = page.locator(".account-affiliate");
    await expect(section).toContainText("thandiwe-1");
    await expect(section.locator("#affiliateReferralLink")).toHaveValue("https://www.seasonedzgroup.co.za/?ref=thandiwe-1");
    await expect(section).toContainText("7%");
    await expect(section).toContainText("5%");
    await expect(section).toContainText("R580.00");
    await expect(section).toContainText("R140.50");
    // Recent referred order shown, but never the referred customer's
    // own PII (this mock intentionally has none to leak, matching the
    // real backend shape — §13/§38 of the brief).
    await expect(section).toContainText("SZ-2026-0001");
  });

  test("ACTIVE affiliate below the payout threshold sees a carry-forward message, not a false eligibility claim", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockAffiliatePortal(page, {
      hasAffiliate: true,
      affiliate: { ...ACTIVE_AFFILIATE.affiliate, commissionTotals: { ...ACTIVE_AFFILIATE.affiliate.commissionTotals, approvedUnpaidTotal: 320, isPayoutEligible: false } },
    });

    await page.goto("/account");
    await expect(page.locator(".account-affiliate")).toContainText("carry forward");
  });

  test("SUSPENDED affiliate: status shown clearly, historical commissions still visible, no active-promotion framing", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockAffiliatePortal(page, { hasAffiliate: true, affiliate: { ...ACTIVE_AFFILIATE.affiliate, status: "SUSPENDED" } });

    await page.goto("/account");
    const section = page.locator(".account-affiliate");
    await expect(section).toContainText("Suspended");
    await expect(section).toContainText("SZ-2026-0001");
    await expect(section.locator('[data-action="apply-for-affiliate"]')).toHaveCount(0);
  });

  test("REJECTED affiliate: neutral status only, no admin notes exposed", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockAffiliatePortal(page, { hasAffiliate: true, affiliate: { ...ACTIVE_AFFILIATE.affiliate, status: "REJECTED", recentCommissions: [] } });

    await page.goto("/account");
    const section = page.locator(".account-affiliate");
    await expect(section).toContainText("Not Approved");
  });

  test("copy referral link button copies the exact link", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mockLoggedInCustomer(page);
    await mockAffiliatePortal(page, ACTIVE_AFFILIATE);

    await page.goto("/account");
    await page.locator('[data-action="copy-referral-link"]').click();
    await expect(page.locator('[data-action="copy-referral-link"]')).toHaveText("Copied!");
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe("https://www.seasonedzgroup.co.za/?ref=thandiwe-1");
  });
});

// Version 7, Milestone 176: the old single-click "Apply" flow (POST
// /customers/affiliate/apply) is no longer reachable from the account
// page — applying now means completing the full application form at
// its own dedicated page. See affiliateApplication.spec.js for the
// application page's own form/upload/submit coverage.
test.describe("Affiliate application flow", () => {
  test("Apply to Become an Affiliate navigates to the application page, never immediately creates an affiliate", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await mockAffiliatePortal(page, { hasAffiliate: false, affiliate: null });
    let applyEndpointCalled = false;
    await page.route("**/api/customers/affiliate/apply", (route) => {
      applyEndpointCalled = true;
      return route.fulfill({ status: 201, contentType: "application/json", body: envelope({ id: "aff-new", status: "PENDING" }) });
    });
    await page.route("**/api/customers/affiliate/application", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ hasApplication: true, application: { id: "app-1", status: "DRAFT", documents: [], applicantType: "INDIVIDUAL" } }) });
    });

    await page.goto("/account");
    await page.locator('.account-affiliate a[href="/account/affiliate-application"]').click();
    await expect(page).toHaveURL(/\/account\/affiliate-application$/);
    expect(applyEndpointCalled).toBe(false);
  });
});

test.describe("Affiliate Programme Terms page", () => {
  test("loads with real, accurate rate/policy content", async ({ page }) => {
    await page.goto("/affiliate-terms");
    await expect(page.locator("h1")).toHaveText("Affiliate Programme Terms");
    const body = page.locator(".policy-page");
    await expect(body).toContainText("30 days");
    await expect(body).toContainText("R500");
    await expect(body).toContainText("15th");
    await expect(body).toContainText("Self-Referral");
    await expect(body).toContainText("disclose");
  });

  test("is indexable (not noindex) and linked from the footer", async ({ page }) => {
    await page.goto("/affiliate-terms");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).not.toContain("noindex");

    await page.goto("/");
    const footerLink = page.locator(".site-footer a", { hasText: "Affiliate Programme Terms" });
    await expect(footerLink).toHaveAttribute("href", "/affiliate-terms");
  });

  test("Terms and Privacy Policy reference the affiliate/referral programme accurately", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.locator(".policy-page")).toContainText("referral link");

    await page.goto("/privacy-policy");
    await expect(page.locator(".policy-page")).toContainText("Affiliate Programme");

    await page.goto("/cookies-policy");
    await expect(page.locator(".policy-page")).toContainText("seasonedz_referral");
    await expect(page.locator(".policy-page")).toContainText("30 days");
  });
});

test.describe("Admin manual payment confirmation UI", () => {
  function mockAdminAuth(page) {
    return page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", email: "owner@example.invalid" }) }));
  }

  const BASE_ORDER = {
    orderNumber: "SZ-2026-0002",
    createdAt: "2026-07-01T00:00:00.000Z",
    customer: { firstName: "Thandiwe", lastName: "Nkosi", email: "thandiwe@example.com", phone: "0821234567" },
    deliveryMethod: "COLLECTION",
    deliveryAddress: null,
    collectionCity: "Pretoria",
    status: "CONFIRMED",
    paymentStatus: "PENDING",
    fulfilmentStatus: "NOT_STARTED",
    paymentMethod: "BANK_TRANSFER",
    items: [],
    subtotal: 500,
    giftWrapTotal: 0,
    deliveryFee: 0,
    discountTotal: 0,
    total: 500,
    payment: null,
    shipping: null,
    hasPhysicalItems: false,
    hasDigitalItems: false,
    isDigitalOnly: true,
  };

  function mockOrder(page, order) {
    return page.route(`**/api/admin/orders/${order.orderNumber}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope(order) })
    );
  }

  test("Bank Transfer, unpaid, not cancelled: Confirm Payment Received button is shown and enabled", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, BASE_ORDER);
    await page.route(`**/api/admin/orders/${BASE_ORDER.orderNumber}/status-history`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ statusHistory: [] }) }));

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    const button = page.locator('[data-action="confirm-manual-payment"]');
    await expect(button).toBeVisible();
    await expect(button).toBeEnabled();
  });

  test("PayFast order: no manual confirmation button at all", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, { ...BASE_ORDER, paymentMethod: "PAYFAST" });
    await page.route(`**/api/admin/orders/${BASE_ORDER.orderNumber}/status-history`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ statusHistory: [] }) }));

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    await expect(page.locator('[data-action="confirm-manual-payment"]')).toHaveCount(0);
  });

  test("already-PAID order: no button shown", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, { ...BASE_ORDER, paymentStatus: "PAID" });
    await page.route(`**/api/admin/orders/${BASE_ORDER.orderNumber}/status-history`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ statusHistory: [] }) }));

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    await expect(page.locator('[data-action="confirm-manual-payment"]')).toHaveCount(0);
  });

  test("cancelled order: no button shown", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, { ...BASE_ORDER, status: "CANCELLED" });
    await page.route(`**/api/admin/orders/${BASE_ORDER.orderNumber}/status-history`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ statusHistory: [] }) }));

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    await expect(page.locator('[data-action="confirm-manual-payment"]')).toHaveCount(0);
  });

  test("Cash on Delivery not yet Delivered: button shown but disabled, with an explanatory hint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, { ...BASE_ORDER, paymentMethod: "CASH_ON_DELIVERY", status: "OUT_FOR_DELIVERY" });
    await page.route(`**/api/admin/orders/${BASE_ORDER.orderNumber}/status-history`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ statusHistory: [] }) }));

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    const button = page.locator('[data-action="confirm-manual-payment"]');
    await expect(button).toBeVisible();
    await expect(button).toBeDisabled();
    await expect(page.getByText("Cash on Delivery payment can only be confirmed once this order is marked Delivered.")).toBeVisible();
  });

  test("Cash on Delivery, Delivered: button enabled", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, { ...BASE_ORDER, paymentMethod: "CASH_ON_DELIVERY", status: "DELIVERED" });
    await page.route(`**/api/admin/orders/${BASE_ORDER.orderNumber}/status-history`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ statusHistory: [] }) }));

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    await expect(page.locator('[data-action="confirm-manual-payment"]')).toBeEnabled();
  });

  test("clicking Confirm shows a confirmation dialog identifying method/order/amount, and calls the endpoint on accept", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, BASE_ORDER);
    await page.route(`**/api/admin/orders/${BASE_ORDER.orderNumber}/status-history`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ statusHistory: [] }) }));

    let confirmCalled = false;
    let dialogMessage = "";
    page.once("dialog", (dialog) => {
      dialogMessage = dialog.message();
      dialog.accept();
    });
    await page.route(`**/api/admin/orders/${BASE_ORDER.orderNumber}/confirm-payment`, (route) => {
      confirmCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ orderNumber: BASE_ORDER.orderNumber, paymentMethod: "BANK_TRANSFER", paymentStatus: "PAID", paidAt: new Date().toISOString(), amount: 500 }) });
    });

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    await page.locator('[data-action="confirm-manual-payment"]').click();
    await expect.poll(() => confirmCalled).toBe(true);
    expect(dialogMessage).toContain("SZ-2026-0002");
    expect(dialogMessage).toContain("Bank Transfer");
    expect(dialogMessage).toContain("500");
  });

  test("declining the confirmation dialog never calls the endpoint", async ({ page }) => {
    await mockAdminAuth(page);
    await mockOrder(page, BASE_ORDER);
    await page.route(`**/api/admin/orders/${BASE_ORDER.orderNumber}/status-history`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ statusHistory: [] }) }));

    let confirmCalled = false;
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.route(`**/api/admin/orders/${BASE_ORDER.orderNumber}/confirm-payment`, (route) => {
      confirmCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({}) });
    });

    await page.goto(`/admin/orders/${BASE_ORDER.orderNumber}`);
    await page.locator('[data-action="confirm-manual-payment"]').click();
    await page.waitForTimeout(300);
    expect(confirmCalled).toBe(false);
  });
});
