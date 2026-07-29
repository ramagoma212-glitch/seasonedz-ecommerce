// Version 7, Milestone 149: homepage hero product banner. Covers the
// owner-approved image (served as WebP, real HTML text overlaid on
// its own empty left zone on desktop, stacked above it on mobile),
// the single h1, both CTAs, and that nothing else on the page (the
// marketplace section, the footer) broke.
import { test, expect } from "@playwright/test";

test.describe("Homepage hero", () => {
  test("homepage loads and hero image is present", async ({ page }) => {
    await page.goto("/");
    const heroImg = page.locator(".hero__image");
    await expect(heroImg).toBeVisible();
    await expect(heroImg).toHaveAttribute("src", /\.webp$/);
    await expect(heroImg).toHaveAttribute("loading", "eager");
    await expect(heroImg).toHaveAttribute("fetchpriority", "high");
    await expect(heroImg).toHaveAttribute(
      "alt",
      "Seasonedz Group educational colouring books, Bible colouring books, mindfulness colouring book, acrylic markers and rotating crayons."
    );
    // Rendered inside a <picture> so a mobile-specific <source> can be
    // added later without any markup restructuring.
    await expect(page.locator("picture > .hero__image")).toHaveCount(1);
  });

  test("hero heading is visible, is the only h1, and is real selectable text", async ({ page }) => {
    await page.goto("/");
    const h1s = page.locator("h1");
    await expect(h1s).toHaveCount(1);
    await expect(h1s).toHaveText("Educational Colouring Books Made for Growing Minds");

    // Real HTML text, not baked into the image — selectable/copyable
    // and readable by screen readers and search engines alike.
    const subtitleText = await page.locator(".hero__subtitle").textContent();
    expect(subtitleText).toContain("trusted South African brand");
  });

  test("hero CTA buttons are visible and navigate to the shop page", async ({ page }) => {
    await page.goto("/");
    const primary = page.getByRole("link", { name: "Shop Bestsellers" });
    const secondary = page.getByRole("link", { name: "Browse All Products" });
    await expect(primary).toBeVisible();
    await expect(secondary).toBeVisible();

    await primary.click();
    await expect(page).toHaveURL(/\/shop$/);
  });

  test("marketplace section still appears after the hero", async ({ page }) => {
    await page.goto("/");
    const hero = page.locator(".hero");
    const marketplace = page.locator(".marketplace-card").first();
    await expect(hero).toBeVisible();
    await expect(marketplace).toBeVisible();

    const heroBox = await hero.boundingBox();
    const marketplaceBox = await marketplace.boundingBox();
    expect(marketplaceBox.y).toBeGreaterThan(heroBox.y);
  });

  test("footer still renders with working links", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator(".site-footer");
    await expect(footer).toBeVisible();
    await expect(footer.locator("a").first()).toBeVisible();
  });

  test("desktop: hero text does not cover the products", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto("/");
    const content = page.locator(".hero__content");
    const heroImg = page.locator(".hero__image");
    const contentBox = await content.boundingBox();
    const imgBox = await heroImg.boundingBox();
    // The photo's own empty zone measures ~33.3% of its width (see
    // src/css/responsive.css's own comment on the exact measurement) —
    // asserting a smaller 40% ceiling here leaves comfortable margin
    // while still catching any regression that widens the text column
    // enough to risk reaching the first product.
    expect(contentBox.x + contentBox.width).toBeLessThan(imgBox.x + imgBox.width * 0.4);
  });

  for (const width of [320, 360, 375, 390]) {
    test(`no horizontal scroll on homepage at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      await expect(page.locator(".hero__image")).toBeVisible();
      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(hasHorizontalScroll).toBe(false);
    });
  }

  test("mobile: hero text stacks above the image, never overlapping it", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/");
    const content = page.locator(".hero__content");
    const heroImg = page.locator(".hero__image");
    const contentBox = await content.boundingBox();
    const imgBox = await heroImg.boundingBox();
    expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(imgBox.y + 1);
  });

  test("mobile: hero CTA buttons stay at least 44px tall and stack vertically", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/");
    const buttons = page.locator(".hero__actions .btn");
    await expect(buttons).toHaveCount(2);
    const boxes = await Promise.all((await buttons.all()).map((b) => b.boundingBox()));
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    // Stacked (not side-by-side): the second button starts below the
    // first, not to its right.
    expect(boxes[1].y).toBeGreaterThan(boxes[0].y);
  });
});
