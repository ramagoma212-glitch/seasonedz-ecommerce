// Milestone 185: Marketing Link Builder — a stateless UTM campaign
// link generator inside Content Studio for Facebook/Instagram/TikTok
// posts scheduled through Metricool. Never submits anything to a
// backend endpoint (js/marketingLinks.js's buildMarketingLink() is a
// pure function) — same "mock the admin session, never drive a real
// login" discipline as contentStudio.spec.js.
import { test, expect } from "@playwright/test";

function envelope(data) {
  return JSON.stringify({ success: true, message: "OK", data });
}

async function mockAdminAuth(page, { role = "ADMIN" } = {}) {
  await page.route("**/api/admin/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ id: "admin-1", name: "Admin", email: "owner@example.invalid", role }) })
  );
}

const MOCK_PRODUCTS = [
  {
    id: "prod-1",
    name: "ABC Colouring Book for Kids with Fun Facts",
    slug: "abc-colouring-book-for-kids-with-fun-facts",
    sku: "ABC-1",
    category: { id: "cat-1", name: "Kids Colouring Books", slug: "kids-colouring-books" },
    price: 100,
    oldPrice: null,
    stockQuantity: 10,
    stockStatus: "In Stock",
    image: "/images/product-1.jpg",
    gallery: ["/images/product-1.jpg"],
    shortDescription: "A mock product.",
    description: "A mock product.",
    features: [],
    ageRange: "3-8 years",
    tags: [],
    ratingAverage: 0,
    reviewCount: 0,
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: false,
    discountLabel: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    productType: "PHYSICAL",
    isPreorder: false,
    isPreorderDiscountEligible: false,
    preorderReleaseAt: null,
  },
];

const MOCK_CATEGORIES = [{ id: "cat-1", slug: "kids-colouring-books", name: "Kids Colouring Books", description: "", productCount: 1 }];

async function mockCatalog(page) {
  await page.route("**/api/products", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ products: MOCK_PRODUCTS }) }));
  await page.route("**/api/categories", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ categories: MOCK_CATEGORIES }) }));
}

async function gotoBuilder(page, { role = "ADMIN" } = {}) {
  await mockAdminAuth(page, { role });
  await mockCatalog(page);
  await page.goto("/admin/content-studio/marketing-links");
  await expect(page.locator("[data-marketing-link-form]")).toBeVisible();
}

async function fillCampaign(page, campaign) {
  await page.locator("#marketingLinkCampaign").fill(campaign);
}

test.describe("Marketing Link Builder: access (Part I)", () => {
  test("an ADMIN session can reach the Marketing Link Builder", async ({ page }) => {
    await gotoBuilder(page, { role: "ADMIN" });
    await expect(page.locator("h2", { hasText: "Marketing Link Builder" })).toBeVisible();
  });

  test("a STAFF session can also reach the Marketing Link Builder — never redirected or restricted", async ({ page }) => {
    await gotoBuilder(page, { role: "STAFF" });
    await expect(page.locator("h2", { hasText: "Marketing Link Builder" })).toBeVisible();
    await expect(page.locator("[data-marketing-link-form]")).toBeVisible();
  });

  test("Marketing Links appears in the Content Studio sub-navigation and home page", async ({ page }) => {
    await mockAdminAuth(page);
    await page.goto("/admin/content-studio");
    // Both a sub-nav tab and a home-page card link to the same href —
    // the point of this test is that at least one of each real, visible
    // entry point exists, not which one.
    await expect(page.locator('.admin-nav__link[href="/admin/content-studio/marketing-links"]')).toBeVisible();
    await expect(page.locator('.admin-content-studio-card[href="/admin/content-studio/marketing-links"]')).toBeVisible();
  });
});

test.describe("Marketing Link Builder: destinations and sources (Parts B-E)", () => {
  test("Facebook source produces utm_source=facebook&utm_medium=social", async ({ page }) => {
    await gotoBuilder(page);
    await page.locator("#marketingLinkSource").selectOption("facebook");
    await page.locator("#marketingLinkMedium").selectOption("social");
    await fillCampaign(page, "test_campaign");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link).toContain("utm_source=facebook");
    expect(link).toContain("utm_medium=social");
    expect(link.startsWith("https://www.seasonedzgroup.co.za/")).toBe(true);
  });

  test("Instagram source with paid_social medium", async ({ page }) => {
    await gotoBuilder(page);
    await page.locator("#marketingLinkSource").selectOption("instagram");
    await page.locator("#marketingLinkMedium").selectOption("paid_social");
    await fillCampaign(page, "test_campaign");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link).toContain("utm_source=instagram");
    expect(link).toContain("utm_medium=paid_social");
  });

  test("TikTok source", async ({ page }) => {
    await gotoBuilder(page);
    await page.locator("#marketingLinkSource").selectOption("tiktok");
    await fillCampaign(page, "test_campaign");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link).toContain("utm_source=tiktok");
  });

  test("a custom source is accepted and sanitised the same way as a preset", async ({ page }) => {
    await gotoBuilder(page);
    await page.locator("#marketingLinkSource").selectOption("__custom__");
    await expect(page.locator("#marketingLinkSourceCustom")).toBeVisible();
    await page.locator("#marketingLinkSourceCustom").fill("Newsletter Blast");
    await fillCampaign(page, "test_campaign");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link).toContain("utm_source=newsletter_blast");
  });

  test("Product destination links to the real product's canonical page", async ({ page }) => {
    await gotoBuilder(page);
    await page.locator("#marketingLinkDestinationType").selectOption("product");
    await expect(page.locator('[data-marketing-link-field="product"]')).toBeVisible();
    await page.locator("#marketingLinkProduct").selectOption("abc-colouring-book-for-kids-with-fun-facts");
    await fillCampaign(page, "test_campaign");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link.startsWith("https://www.seasonedzgroup.co.za/product/abc-colouring-book-for-kids-with-fun-facts/?")).toBe(true);
  });

  test("Category destination links to the real category page", async ({ page }) => {
    await gotoBuilder(page);
    await page.locator("#marketingLinkDestinationType").selectOption("category");
    await page.locator("#marketingLinkCategory").selectOption("kids-colouring-books");
    await fillCampaign(page, "test_campaign");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link.startsWith("https://www.seasonedzgroup.co.za/category/kids-colouring-books/?")).toBe(true);
  });

  test("Blog Post destination links to a real blog post", async ({ page }) => {
    await gotoBuilder(page);
    await page.locator("#marketingLinkDestinationType").selectOption("blog");
    await expect(page.locator("#marketingLinkBlog option")).not.toHaveCount(0);
    await fillCampaign(page, "test_campaign");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link).toContain("https://www.seasonedzgroup.co.za/blog/");
  });

  test("Homepage and Shop destinations use their own real canonical paths", async ({ page }) => {
    await gotoBuilder(page);
    await fillCampaign(page, "test_campaign");
    let link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link.startsWith("https://www.seasonedzgroup.co.za/?")).toBe(true);

    await page.locator("#marketingLinkDestinationType").selectOption("shop");
    link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link.startsWith("https://www.seasonedzgroup.co.za/shop/?")).toBe(true);
  });
});

test.describe("Marketing Link Builder: fields and naming rules (Parts B, K)", () => {
  test("campaign is sanitised: spaces become underscores, uppercase becomes lowercase, punctuation is stripped", async ({ page }) => {
    await gotoBuilder(page);
    await fillCampaign(page, "Revised Books Launch 2026!!");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link).toContain("utm_campaign=revised_books_launch_2026");
  });

  test("utm_content is included when filled, omitted when empty", async ({ page }) => {
    await gotoBuilder(page);
    await fillCampaign(page, "test_campaign");
    let link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link).not.toContain("utm_content");

    await page.locator("#marketingLinkContent").fill("ABC Video 01");
    link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link).toContain("utm_content=abc_video_01");
  });

  test("utm_term is included when filled, omitted when empty", async ({ page }) => {
    await gotoBuilder(page);
    await fillCampaign(page, "test_campaign");
    let link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link).not.toContain("utm_term");

    await page.locator("#marketingLinkTerm").fill("colouring books");
    link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link).toContain("utm_term=colouring_books");
  });

  test("campaign is required — no link is generated, and an error shows, until it's filled", async ({ page }) => {
    await gotoBuilder(page);
    await expect(page.locator("#marketingLinkOutput")).toHaveValue("");
    await page.locator("#marketingLinkCampaign").fill("x");
    await page.locator("#marketingLinkCampaign").fill("");
    await page.locator("#marketingLinkCampaign").blur();
    await expect(page.locator("[data-marketing-link-errors]")).toBeVisible();
    await expect(page.locator("[data-marketing-link-errors]")).toContainText("Campaign is required.");
    await expect(page.locator('[data-action="copy-marketing-link"]')).toBeDisabled();
  });

  test("the personal-information warning note is always visible", async ({ page }) => {
    await gotoBuilder(page);
    await expect(page.locator("[data-marketing-link-pii-note]")).toContainText(
      "Do not include customer names, email addresses, phone numbers, order numbers or other personal information"
    );
  });
});

test.describe("Marketing Link Builder: manual URL and existing query strings (Parts B, K)", () => {
  test("a manual Seasonedz URL (root-relative) is accepted", async ({ page }) => {
    await gotoBuilder(page);
    await page.locator("#marketingLinkDestinationType").selectOption("manual");
    await page.locator("#marketingLinkManualUrl").fill("/wholesale");
    await fillCampaign(page, "test_campaign");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    expect(link.startsWith("https://www.seasonedzgroup.co.za/wholesale?")).toBe(true);
  });

  test("a manual Seasonedz URL with an existing query string keeps that parameter alongside the new UTM ones", async ({ page }) => {
    await gotoBuilder(page);
    await page.locator("#marketingLinkDestinationType").selectOption("manual");
    await page.locator("#marketingLinkManualUrl").fill("https://www.seasonedzgroup.co.za/shop?category=bundles");
    await fillCampaign(page, "test_campaign");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    const url = new URL(link);
    expect(url.searchParams.get("category")).toBe("bundles");
    expect(url.searchParams.get("utm_campaign")).toBe("test_campaign");
  });

  test("an external domain is rejected — no link is generated, a clear error shows", async ({ page }) => {
    await gotoBuilder(page);
    await page.locator("#marketingLinkDestinationType").selectOption("manual");
    await page.locator("#marketingLinkManualUrl").fill("https://example.com/shop");
    await fillCampaign(page, "test_campaign");

    await expect(page.locator("#marketingLinkOutput")).toHaveValue("");
    await expect(page.locator("[data-marketing-link-errors]")).toContainText("external domains are rejected");
  });
});

test.describe("Marketing Link Builder: copy link (Part K)", () => {
  test("Copy Link copies the exact currently-generated URL to the clipboard", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoBuilder(page);
    await fillCampaign(page, "test_campaign");

    const link = await page.locator("#marketingLinkOutput").inputValue();
    await page.locator('[data-action="copy-marketing-link"]').click();
    await expect(page.locator('[data-action="copy-marketing-link"]')).toHaveText("Copied!");

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(link);
  });
});
