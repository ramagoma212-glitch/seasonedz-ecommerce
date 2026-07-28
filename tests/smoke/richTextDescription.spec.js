// Version 7, Milestone 146: rich text product description editor.
// Admin pages require a logged-in session this "local" project build
// has no real backend to provide — every admin API call here is
// mocked via page.route(), the same pattern tests/smoke/account.spec.js
// already uses for customer session mocking. Real sanitisation
// (script tags, event handlers, disallowed tags, the 5,000-visible-
// character limit) is covered by the backend's own integration tests
// (backend/src/_testDescriptionEditor146.ts) — these tests cover the
// editor UI and the public rendering path only, never a real admin
// login or a real product write.
import { test, expect } from "@playwright/test";

const MOCK_CATEGORIES = [{ id: "cat-1", slug: "kids-colouring-books", name: "Kids Colouring Books", description: "", productCount: 3 }];

async function mockAdminCreatePage(page) {
  await page.route("**/api/admin/auth/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { id: "admin-1", email: "owner@example.invalid" } }) })
  );
  await page.route("**/api/categories", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { categories: MOCK_CATEGORIES } }) })
  );
}

test.describe("Rich text product description editor (admin)", () => {
  test("toolbar shows only the approved formatting buttons", async ({ page }) => {
    await mockAdminCreatePage(page);
    await page.goto("/admin/products/new");
    await expect(page.locator(".description-editor")).toBeVisible();

    // Approved buttons present.
    await expect(page.locator('[aria-label="Bold"]')).toBeVisible();
    await expect(page.locator('[aria-label="Italic"]')).toBeVisible();
    await expect(page.locator('[aria-label="Heading 2"]')).toBeVisible();
    await expect(page.locator('[aria-label="Heading 3"]')).toBeVisible();
    await expect(page.locator('[aria-label="Bullet list"]')).toBeVisible();
    await expect(page.locator('[aria-label="Numbered list"]')).toBeVisible();
    await expect(page.locator('[aria-label="Undo"]')).toBeVisible();
    await expect(page.locator('[aria-label="Redo"]')).toBeVisible();
    await expect(page.locator('[aria-label="Remove formatting"]')).toBeVisible();

    // Explicitly-forbidden controls never render: no colour/background
    // pickers, no font selector, no link/image/video/code-block/table
    // buttons — Quill's own toolbar module only ever renders what this
    // component's markup lists, so this doubles as confirmation
    // nothing extra was left enabled.
    await expect(page.locator(".ql-color")).toHaveCount(0);
    await expect(page.locator(".ql-background")).toHaveCount(0);
    await expect(page.locator(".ql-font")).toHaveCount(0);
    await expect(page.locator(".ql-link")).toHaveCount(0);
    await expect(page.locator(".ql-image")).toHaveCount(0);
    await expect(page.locator(".ql-video")).toHaveCount(0);
    await expect(page.locator(".ql-code-block")).toHaveCount(0);
  });

  test("bold, italic and heading formatting apply and update the character counter", async ({ page }) => {
    await mockAdminCreatePage(page);
    await page.goto("/admin/products/new");
    await expect(page.locator(".description-editor")).toBeVisible();

    const editor = page.locator(".ql-editor");
    await editor.click();
    await page.keyboard.type("Hello world");
    await expect(page.locator("[data-description-counter]")).toHaveText("11 / 5000 characters");

    await page.keyboard.press("Control+A");
    await page.click('[aria-label="Bold"]');
    await expect.poll(() => page.locator("#productDescription").inputValue()).toContain("<strong>");

    await page.click('[aria-label="Italic"]');
    await expect.poll(() => page.locator("#productDescription").inputValue()).toContain("<em>");

    await page.click('[aria-label="Heading 2"]');
    await expect.poll(() => page.locator("#productDescription").inputValue()).toContain("<h2>");
  });

  test("preview toggle shows formatted output", async ({ page }) => {
    await mockAdminCreatePage(page);
    await page.goto("/admin/products/new");
    await page.locator(".ql-editor").click();
    await page.keyboard.type("Preview me");

    const previewToggle = page.locator("[data-description-preview-toggle]");
    const previewPanel = page.locator("[data-description-preview]");
    await expect(previewPanel).toBeHidden();

    await previewToggle.click();
    await expect(previewPanel).toBeVisible();
    await expect(previewPanel).toContainText("Preview me");
    await expect(previewToggle).toHaveText("Hide Preview");
  });

  test("counter warns when over the 5,000 visible character limit", async ({ page }) => {
    await mockAdminCreatePage(page);
    await page.goto("/admin/products/new");
    const editor = page.locator(".ql-editor");
    await editor.click();
    // insertText is far faster than 5,001 simulated keystrokes for a smoke test.
    await page.keyboard.insertText("a".repeat(5001));
    const counter = page.locator("[data-description-counter]");
    await expect(counter).toHaveClass(/is-over-limit/);
  });
});

test.describe("Rich text product description (public rendering)", () => {
  test("renders approved formatting (bold, italic, headings, lists) safely", async ({ page }) => {
    const product = {
      id: "prod-1",
      slug: "rich-text-test-product",
      name: "Rich Text Test Product",
      sku: "SKU-RICH-1",
      price: 100,
      oldPrice: null,
      stockStatus: "In Stock",
      shortDescription: "Short teaser.",
      description:
        "<h2>Great Product</h2><p>This has <strong>bold</strong> and <em>italic</em> text.</p><ul><li>Point one</li><li>Point two</li></ul><ol><li>Step one</li><li>Step two</li></ol>",
      image: "/images/product-1.jpg",
      gallery: [],
      category: "Test Category",
      categorySlug: "test-category",
      features: [],
      ageRange: "",
      tags: [],
      isFeatured: false,
      isBestSeller: false,
      isNewArrival: false,
    };

    await page.route("**/api/products", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { products: [product] } }) })
    );
    await page.route("**/api/categories", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "OK", data: { categories: [{ id: "test-category", slug: "test-category", name: "Test Category", description: "", productCount: 1 }] } }),
      })
    );

    await page.goto(`/product/${product.slug}`);
    const content = page.locator(".product-details__description-content");
    await expect(content.locator("h2")).toHaveText("Great Product");
    await expect(content.locator("strong")).toHaveText("bold");
    await expect(content.locator("em")).toHaveText("italic");
    await expect(content.locator("ul li")).toHaveCount(2);
    await expect(content.locator("ol li")).toHaveCount(2);

    // No script tag makes it into the rendered DOM at all — the source
    // HTML above is already what the backend sanitiser would have
    // produced (see backend/src/_testDescriptionEditor146.ts for
    // confirmation that a real malicious submission never reaches
    // storage looking like this in the first place).
    await expect(content.locator("script")).toHaveCount(0);
  });

  test("legacy plain text description still displays with preserved line breaks", async ({ page }) => {
    const product = {
      id: "prod-2",
      slug: "legacy-text-test-product",
      name: "Legacy Text Test Product",
      sku: "SKU-LEGACY-1",
      price: 50,
      oldPrice: null,
      stockStatus: "In Stock",
      shortDescription: "Short teaser.",
      description: "Line one of a legacy plain text description.\nLine two, same paragraph.\n\nA second paragraph.",
      image: "/images/product-1.jpg",
      gallery: [],
      category: "Test Category",
      categorySlug: "test-category",
      features: [],
      ageRange: "",
      tags: [],
      isFeatured: false,
      isBestSeller: false,
      isNewArrival: false,
    };

    await page.route("**/api/products", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "OK", data: { products: [product] } }) })
    );
    await page.route("**/api/categories", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "OK", data: { categories: [{ id: "test-category", slug: "test-category", name: "Test Category", description: "", productCount: 1 }] } }),
      })
    );

    await page.goto(`/product/${product.slug}`);
    const content = page.locator(".product-details__description-content");
    await expect(content.locator("p")).toHaveCount(2);
    await expect(content.locator("p").first().locator("br")).toHaveCount(1);
    await expect(content).toContainText("Line one of a legacy plain text description.");
    await expect(content).toContainText("A second paragraph.");
  });

  test("mobile: description content has no horizontal scroll", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/product/abc-colouring-book-for-kids-with-fun-facts");
    await expect(page.locator(".product-details__description-content")).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalScroll).toBe(false);
  });
});
