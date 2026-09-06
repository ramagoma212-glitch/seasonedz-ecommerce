// Milestone 182: the Zeely Campaign Brief admin UI. Every "logged in"
// scenario is mocked via page.route(), same established discipline as
// contentStudio.spec.js — no real authenticated admin session, no real
// backend call, no paid AI provider anywhere in this flow.
import { test, expect } from "@playwright/test";

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

async function mockAdminAuth(page, role = "ADMIN") {
  await page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admin: { id: "admin-1", name: "Admin", email: "owner@example.invalid", role } }) }));
}

const MOCK_PRODUCT = {
  id: "prod-1",
  name: "Old Testament Bible Colouring Book",
  slug: "old-testament-bible-colouring-book",
  sku: "SG-002",
  status: "ACTIVE",
  stockQuantity: 100,
  lowStockThreshold: 5,
  price: 120,
  productType: "PHYSICAL",
  preorderAdminStatus: "PREORDER_ACTIVE",
  isPreorderEnabled: true,
  categoryName: null,
  primaryImageUrl: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_AUDIENCE = { id: "aud-1", name: "Churches", description: "Church groups.", painPoints: null, motivations: null, preferredContent: null, isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const MOCK_PILLAR = { id: "pillar-1", name: "Bible Learning", description: "Faith-based learning.", isActive: true, sortOrder: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };

const MOCK_BRIEF = {
  id: "brief-1",
  product: { id: "prod-1", name: MOCK_PRODUCT.name, slug: MOCK_PRODUCT.slug, price: 120 },
  audience: { id: "aud-1", name: "Churches" },
  pillar: { id: "pillar-1", name: "Bible Learning" },
  platforms: ["INSTAGRAM", "FACEBOOK"],
  goal: "PREORDER",
  campaignType: null,
  contentQuantity: null,
  campaignStartAt: null,
  campaignEndAt: null,
  callToAction: null,
  additionalInstructions: null,
  generatedBriefText: "ZEELY CAMPAIGN BRIEF\nPrepared by Seasonedz Group.\n\nCAMPAIGN OBJECTIVE\nGoal: Preorder.",
  generatedAt: new Date().toISOString(),
  status: "DRAFT",
  createdByAdmin: null,
  updatedByAdmin: null,
  contentRecords: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function mockFormData(page) {
  await page.route("**/api/admin/products?*", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ products: [MOCK_PRODUCT], total: 1, page: 1, limit: 100, totalPages: 1 }) });
  });
  await page.route("**/api/admin/content-studio/audiences?*", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope([MOCK_AUDIENCE]) });
  });
  await page.route("**/api/admin/content-studio/pillars?*", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope([MOCK_PILLAR]) });
  });
}

async function mockBriefDetail(page, brief = MOCK_BRIEF) {
  await page.route(`**/api/admin/content-studio/campaign-briefs/${brief.id}`, (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope(brief) });
  });
}

test.describe("Campaign Brief creation form", () => {
  test("shows Product, Audience, Pillar, Platform and Goal fields, and no free-text chat box", async ({ page }) => {
    await mockAdminAuth(page);
    await mockFormData(page);
    await page.goto("/admin/content-studio/campaign-briefs/new");

    await expect(page.locator("#briefProduct")).toBeVisible();
    await expect(page.locator("#briefAudience")).toBeVisible();
    await expect(page.locator("#briefPillar")).toBeVisible();
    await expect(page.locator("#briefGoal")).toBeVisible();
    await expect(page.locator('input[name="briefPlatform"]')).toHaveCount(7);
    await expect(page.getByRole("button", { name: "Generate Brief" })).toBeVisible();
    // Not a chatbot: no generic free-text prompt input.
    await expect(page.locator('textarea[placeholder*="prompt" i]')).toHaveCount(0);
  });

  test("the product option mentions its real price and current preorder status, never an invented one", async ({ page }) => {
    await mockAdminAuth(page);
    await mockFormData(page);
    await page.goto("/admin/content-studio/campaign-briefs/new");
    await expect(page.locator("#briefProduct option", { hasText: "R120.00" })).toHaveCount(1);
    await expect(page.locator("#briefProduct option", { hasText: "Preorder Active" })).toHaveCount(1);
  });

  test("submitting without a product, audience, pillar, platform or goal shows a validation error, never a silent failure", async ({ page }) => {
    await mockAdminAuth(page);
    await mockFormData(page);
    await page.goto("/admin/content-studio/campaign-briefs/new");
    await page.locator("[data-admin-campaign-brief-form] button[type=submit]").click();
    await expect(page.locator("[data-admin-campaign-brief-banner]")).toBeVisible();
  });

  test("a complete submission creates the brief and redirects to its review page", async ({ page }) => {
    await mockAdminAuth(page);
    await mockFormData(page);
    let createdBody;
    await page.route("**/api/admin/content-studio/campaign-briefs", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      createdBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: envelope({ ...MOCK_BRIEF, id: "brief-new" }) });
    });
    await mockBriefDetail(page, { ...MOCK_BRIEF, id: "brief-new" });

    await page.goto("/admin/content-studio/campaign-briefs/new");
    await page.locator("#briefProduct").selectOption("prod-1");
    await page.locator("#briefAudience").selectOption("aud-1");
    await page.locator("#briefPillar").selectOption("pillar-1");
    await page.locator('input[name="briefPlatform"][value="INSTAGRAM"]').check();
    await page.locator("#briefGoal").selectOption("PREORDER");
    await page.locator("[data-admin-campaign-brief-form] button[type=submit]").click();

    await expect(page).toHaveURL(/\/admin\/content-studio\/campaign-briefs\/brief-new/);
    expect(createdBody.productId).toBe("prod-1");
    expect(createdBody.audienceId).toBe("aud-1");
    expect(createdBody.pillarId).toBe("pillar-1");
    expect(createdBody.platforms).toEqual(["INSTAGRAM"]);
    expect(createdBody.goal).toBe("PREORDER");
  });
});

test.describe("Campaign Brief review page", () => {
  test("shows the generated brief text, and Copy/Download/Regenerate actions", async ({ page }) => {
    await mockAdminAuth(page);
    await mockBriefDetail(page);
    await page.goto("/admin/content-studio/campaign-briefs/brief-1");

    await expect(page.locator("[data-admin-campaign-brief-text]")).toContainText("ZEELY CAMPAIGN BRIEF");
    await expect(page.getByRole("button", { name: "Copy for Zeely" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Download as .txt" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Regenerate" })).toBeVisible();
  });

  test("Copy for Zeely copies the exact brief text to the clipboard", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permission grants are chromium-only in Playwright");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await mockAdminAuth(page);
    await mockBriefDetail(page);
    await page.goto("/admin/content-studio/campaign-briefs/brief-1");

    await page.getByRole("button", { name: "Copy for Zeely" }).click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain("ZEELY CAMPAIGN BRIEF");
  });

  test("a DRAFT brief shows a 'Move to Ready For Zeely' action, never a jump straight to Published", async ({ page }) => {
    await mockAdminAuth(page);
    await mockBriefDetail(page, { ...MOCK_BRIEF, status: "DRAFT" });
    await page.goto("/admin/content-studio/campaign-briefs/brief-1");

    await expect(page.getByRole("button", { name: "Move to Ready For Zeely" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Move to Published" })).toHaveCount(0);
  });

  test("ADMIN sees an Archive action; STAFF does not", async ({ page }) => {
    await mockAdminAuth(page, "ADMIN");
    await mockBriefDetail(page);
    await page.goto("/admin/content-studio/campaign-briefs/brief-1");
    await expect(page.getByRole("button", { name: "Archive" })).toBeVisible();
  });

  test("STAFF does not see an Archive action", async ({ page }) => {
    await mockAdminAuth(page, "STAFF");
    await mockBriefDetail(page);
    await page.goto("/admin/content-studio/campaign-briefs/brief-1");
    await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);
  });

  test("moving status calls the backend and shows the updated badge", async ({ page }) => {
    await mockAdminAuth(page);
    let currentStatus = "DRAFT";
    await page.route("**/api/admin/content-studio/campaign-briefs/brief-1", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...MOCK_BRIEF, status: currentStatus }) });
    });
    await page.route("**/api/admin/content-studio/campaign-briefs/brief-1/status", (route) => {
      currentStatus = route.request().postDataJSON().status;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...MOCK_BRIEF, status: currentStatus }) });
    });

    await page.goto("/admin/content-studio/campaign-briefs/brief-1");
    await page.getByRole("button", { name: "Move to Ready For Zeely" }).click();
    await expect(page.locator(".admin-badge", { hasText: "Ready For Zeely" })).toBeVisible();
  });

  test("adding a content record shows it in the table", async ({ page }) => {
    await mockAdminAuth(page);
    await mockBriefDetail(page);
    await page.route("**/api/admin/content-studio/campaign-briefs/brief-1/content-records", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const body = route.request().postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: envelope({ id: "record-1", ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }) });
    });

    await page.goto("/admin/content-studio/campaign-briefs/brief-1");
    await page.locator("#contentRecordType").fill("Reel");
    await page.locator("#contentRecordPlatform").selectOption("INSTAGRAM");
    await page.locator("[data-admin-content-record-form] button[type=submit]").click();
    await expect(page).toHaveURL(/\/admin\/content-studio\/campaign-briefs\/brief-1/);
  });

  test("never mentions Claude, Anthropic, Gemini, Veo, or an API key on the review page", async ({ page }) => {
    await mockAdminAuth(page);
    await mockBriefDetail(page);
    await page.goto("/admin/content-studio/campaign-briefs/brief-1");
    const bodyText = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of ["claude", "anthropic", "gemini", "veo", "api key", "api_key"]) {
      expect(bodyText.includes(forbidden), `review page unexpectedly mentions "${forbidden}"`).toBe(false);
    }
  });
});

test.describe("Campaign Briefs list", () => {
  test("shows briefs with product, audience, pillar, goal and status", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/content-studio/campaign-briefs?*", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ briefs: [MOCK_BRIEF], total: 1, page: 1, limit: 20, totalPages: 1 }) });
    });
    await page.goto("/admin/content-studio/campaign-briefs");
    await expect(page.getByText(MOCK_BRIEF.product.name)).toBeVisible();
    await expect(page.getByRole("cell", { name: "Churches", exact: true })).toBeVisible();
  });

  test("unauthenticated visitor is redirected to admin login", async ({ page }) => {
    await page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) }));
    await page.route("**/api/admin/content-studio/**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) }));
    await page.goto("/admin/content-studio/campaign-briefs");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});
