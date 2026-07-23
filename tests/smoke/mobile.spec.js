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
