// Version 7, Milestone 103: mobile-viewport smoke checks — header
// menu, homepage category grid/View All links, and the mobile Shop
// filter collapse behaviour (Milestone 93B). The filter-selection test
// deliberately reopens the panel before Clear Filters: selecting a
// filter re-renders the route, which collapses the mobile panel again
// by design, so it isn't still open afterwards (verified repeatedly
// across Milestones 93B/93C/97/99/100B's own testing).
import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Mobile smoke checks", () => {
  test("header hamburger opens the nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".product-card").first()).toBeVisible();

    const toggle = page.locator(".site-header__mobile-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(page.locator(".site-header__nav-list")).toBeVisible();
  });

  test("homepage category grid and View All links are usable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".category-card").first()).toBeVisible();

    const viewAllLinks = page.locator(".section__view-all");
    expect(await viewAllLinks.count()).toBeGreaterThan(0);
    await expect(viewAllLinks.first()).toBeVisible();
  });

  test("shop filter toggle opens/closes, selection and Clear Filters work", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();

    const panel = page.locator("#shop-filter-panel");
    const toggle = page.locator('[data-action="toggle-mobile-filters"]');

    await expect(panel).toBeHidden();
    await toggle.click();
    await expect(panel).toBeVisible();

    await page.selectOption('select[data-filter="category"]', { index: 1 });
    await expect(page).toHaveURL(/category=/);

    // The filter change above re-rendered the route, collapsing the
    // panel again — reopen it before Clear Filters.
    await toggle.click();
    await page.locator(".filter-panel__clear").click();
    await expect(page).not.toHaveURL(/category=/);
  });

  test("product cards and Add to Cart remain visible", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();
    await expect(page.locator('[data-action="add-to-cart"]').first()).toBeVisible();
  });
});

// Version 7, Milestone 148: fixes a site-wide horizontal scroll at
// 320px caused by the header (see src/css/responsive.css's own
// comment on the fix) — a separate, narrower viewport than the rest
// of this file's 390px default, so these get their own describe block
// with a scoped test.use() override.
test.describe("Mobile smoke checks (320px)", () => {
  test.use({ viewport: { width: 320, height: 812 } });

  test("homepage has no horizontal scroll at 320px", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".product-card").first()).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalScroll).toBe(false);
  });

  test("shop page has no horizontal scroll at 320px", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalScroll).toBe(false);
  });

  test("product detail page has no horizontal scroll at 320px", async ({ page }) => {
    await page.goto("/product/abc-colouring-book-for-kids-with-fun-facts");
    await expect(page.locator(".product-details__main-image")).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalScroll).toBe(false);
  });

  test("header hamburger menu opens and closes at 320px", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator(".site-header__mobile-toggle");
    const panel = page.locator(".site-header__collapsible");

    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(panel).toHaveClass(/is-open/);
    await expect(page.locator(".site-header__nav-list")).toBeVisible();

    await toggle.click();
    await expect(panel).not.toHaveClass(/is-open/);
  });
});
