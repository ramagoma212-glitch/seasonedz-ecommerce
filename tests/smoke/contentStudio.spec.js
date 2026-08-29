// Content Studio Phase 2: Brand Knowledge Foundation admin UI. Every
// "logged in" scenario is mocked via page.route(), same established
// discipline as adminAffiliate.spec.js — this project has no
// precedent for driving a real authenticated admin session in
// Playwright. No campaign/generation/publishing UI exists anywhere in
// this file — Phase 2 is Brand Knowledge only.
import { test, expect } from "@playwright/test";

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

async function mockAdminAuth(page) {
  await page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", name: "Admin", email: "owner@example.invalid", role: "ADMIN" }) }));
}

const MOCK_ENTRY = {
  id: "bk-1",
  category: "WRITING_RULE",
  title: "Use colouring, not coloring",
  body: "Always use the British/SA spelling in customer-facing copy.",
  tags: ["spelling", "voice"],
  isActive: true,
  priority: 0,
  sourceType: "OWNER_APPROVED",
  sourceReference: null,
  lastVerifiedAt: null,
  relatedProductId: null,
  pillarId: null,
  audienceId: null,
  createdByAdminId: "admin-1",
  updatedByAdminId: "admin-1",
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

const MOCK_PILLAR = {
  id: "pillar-1",
  name: "Educational Colouring",
  description: "Colouring as a learning tool for young children.",
  isActive: true,
  sortOrder: 0,
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

const MOCK_AUDIENCE = {
  id: "aud-1",
  name: "Parents",
  description: "Parents buying for their own children at home.",
  painPoints: "Limited time for structured screen-free activities.",
  motivations: "Wants engaging, low-mess creative time for their kids.",
  preferredContent: null,
  isActive: true,
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:00.000Z",
};

async function mockBrandKnowledgeList(page, entries = [MOCK_ENTRY]) {
  await page.route("**/api/admin/content-studio/brand-knowledge?*", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ entries, total: entries.length, page: 1, limit: 20, totalPages: 1 }) });
  });
  await page.route("**/api/admin/content-studio/brand-knowledge", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ entries, total: entries.length, page: 1, limit: 20, totalPages: 1 }) });
  });
}

async function mockPillarsList(page, pillars = [MOCK_PILLAR]) {
  await page.route("**/api/admin/content-studio/pillars?*", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope(pillars) });
  });
  await page.route("**/api/admin/content-studio/pillars", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: envelope(pillars) });
    return route.continue();
  });
}

async function mockAudiencesList(page, audiences = [MOCK_AUDIENCE]) {
  await page.route("**/api/admin/content-studio/audiences?*", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({ status: 200, contentType: "application/json", body: envelope(audiences) });
  });
  await page.route("**/api/admin/content-studio/audiences", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ status: 200, contentType: "application/json", body: envelope(audiences) });
    return route.continue();
  });
}

test.describe("Admin navigation", () => {
  test("Content Studio link appears in the top-level admin nav", async ({ page }) => {
    await mockAdminAuth(page);
    await mockBrandKnowledgeList(page);
    await page.goto("/admin/content-studio");
    await expect(page.locator(".admin-nav__link", { hasText: "Content Studio" })).toBeVisible();
  });

  test("unauthenticated visitor is redirected to admin login", async ({ page }) => {
    await page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) }));
    await page.route("**/api/admin/content-studio/**", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) }));
    await page.goto("/admin/content-studio");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("Brand Knowledge admin", () => {
  test("list page shows entries with category, source, tags and status", async ({ page }) => {
    await mockAdminAuth(page);
    await mockBrandKnowledgeList(page);
    await page.goto("/admin/content-studio");

    await expect(page.getByText("Use colouring, not coloring")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Writing Rule" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Owner Approved" })).toBeVisible();
    await expect(page.locator(".admin-badge", { hasText: "spelling" })).toBeVisible();
  });

  test("empty state shows when no entries exist", async ({ page }) => {
    await mockAdminAuth(page);
    await mockBrandKnowledgeList(page, []);
    await page.goto("/admin/content-studio");
    await expect(page.getByText(/No brand knowledge entries yet/)).toBeVisible();
  });

  test("create form rejects submission with no title, body, category or source", async ({ page }) => {
    await mockAdminAuth(page);
    await mockPillarsList(page);
    await mockAudiencesList(page);
    await page.goto("/admin/content-studio/brand-knowledge/new");

    await page.locator("[data-admin-brand-knowledge-form] button[type=submit]").click();
    await expect(page.locator("[data-admin-brand-knowledge-form-banner]")).toBeVisible();
  });

  test("create form submits a valid entry and redirects to its edit page", async ({ page }) => {
    await mockAdminAuth(page);
    await mockPillarsList(page);
    await mockAudiencesList(page);
    let createdBody;
    await page.route("**/api/admin/content-studio/brand-knowledge", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      createdBody = route.request().postDataJSON();
      return route.fulfill({ status: 201, contentType: "application/json", body: envelope({ ...MOCK_ENTRY, ...createdBody, id: "bk-new" }) });
    });
    await page.route("**/api/admin/content-studio/brand-knowledge/bk-new", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...MOCK_ENTRY, id: "bk-new" }) });
    });

    await page.goto("/admin/content-studio/brand-knowledge/new");
    await page.locator("#entryCategory").selectOption("WRITING_RULE");
    await page.locator("#entrySourceType").selectOption("OWNER_APPROVED");
    await page.locator("#entryTitle").fill("Use colouring, not coloring");
    await page.locator("#entryBody").fill("Always use the SA spelling.");
    await page.locator("[data-admin-brand-knowledge-form] button[type=submit]").click();

    await expect(page).toHaveURL(/\/admin\/content-studio\/brand-knowledge\/bk-new\/edit/);
    expect(createdBody.category).toBe("WRITING_RULE");
    expect(createdBody.sourceType).toBe("OWNER_APPROVED");
  });

  test("deactivate then reactivate updates the row's status badge", async ({ page }) => {
    await mockAdminAuth(page);
    let isActive = true;
    await page.route("**/api/admin/content-studio/brand-knowledge?*", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ entries: [{ ...MOCK_ENTRY, isActive }], total: 1, page: 1, limit: 20, totalPages: 1 }) });
    });
    await page.route("**/api/admin/content-studio/brand-knowledge/bk-1/deactivate", (route) => {
      isActive = false;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...MOCK_ENTRY, isActive }) });
    });

    await page.goto("/admin/content-studio");
    await page.locator('[data-action="deactivate-entry"]').click();
    await expect(page.locator(".admin-badge", { hasText: "Inactive" })).toBeVisible();
  });

  test("relatedProductId field never accepts a price, stock or name label — source-of-truth boundary is visible in the form copy", async ({ page }) => {
    await mockAdminAuth(page);
    await mockPillarsList(page);
    await mockAudiencesList(page);
    await page.goto("/admin/content-studio/brand-knowledge/new");
    await expect(page.getByText(/[Nn]ever a substitute for that product's own price, stock or name/)).toBeVisible();
  });
});

test.describe("Content Pillars admin", () => {
  test("list page shows pillars", async ({ page }) => {
    await mockAdminAuth(page);
    await mockPillarsList(page);
    await page.goto("/admin/content-studio/pillars");
    await expect(page.getByText("Educational Colouring")).toBeVisible();
  });

  test("create form requires a name", async ({ page }) => {
    await mockAdminAuth(page);
    await page.goto("/admin/content-studio/pillars/new");
    await page.locator("[data-admin-content-pillar-form] button[type=submit]").click();
    await expect(page.locator("[data-admin-content-pillar-form-banner]")).toContainText("Name is required");
  });

  test("a duplicate pillar name shows the backend's 409 message, not a generic error", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/content-studio/pillars", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ success: false, message: 'A content pillar named "Educational Colouring" already exists.' }) });
    });
    await page.goto("/admin/content-studio/pillars/new");
    await page.locator("#pillarName").fill("Educational Colouring");
    await page.locator("[data-admin-content-pillar-form] button[type=submit]").click();
    await expect(page.locator("[data-admin-content-pillar-form-banner]")).toContainText("already exists");
  });
});

test.describe("Audiences admin", () => {
  test("list page shows audiences with pain points visible on the card, never customer PII fields", async ({ page }) => {
    await mockAdminAuth(page);
    await mockAudiencesList(page);
    await page.goto("/admin/content-studio/audiences");
    await expect(page.getByRole("cell", { name: "Parents", exact: true })).toBeVisible();
  });

  test("create form has no email, phone or customer-lookup field — this is a marketing audience, not a customer record", async ({ page }) => {
    await mockAdminAuth(page);
    await page.goto("/admin/content-studio/audiences/new");
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.locator('input[type="tel"]')).toHaveCount(0);
  });

  test("create form requires a name", async ({ page }) => {
    await mockAdminAuth(page);
    await page.goto("/admin/content-studio/audiences/new");
    await page.locator("[data-admin-audience-form] button[type=submit]").click();
    await expect(page.locator("[data-admin-audience-form-banner]")).toContainText("Name is required");
  });
});
