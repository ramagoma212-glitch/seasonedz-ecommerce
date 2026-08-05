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

  // Version 7, Milestone 150: the homepage's old "Shop by Category"
  // grid (and its mobile "View All" links) was replaced by the
  // redesign's own "Shop by Collection" section (see
  // homeSections.spec.js) — .category-card itself is preserved and
  // still used on the dedicated /categories page.
  test("categories page category grid is usable on mobile", async ({ page }) => {
    await page.goto("/categories");
    await expect(page.locator(".category-card").first()).toBeVisible();
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

  // Version 7, Milestone 151: the header Account icon lives outside
  // the collapsible nav panel (same row as Wishlist/Cart), so it's
  // visible on mobile without opening the hamburger menu at all.
  test("header Account link is visible on mobile without opening the menu", async ({ page }) => {
    await page.goto("/");
    const account = page.locator('.site-header a.icon-link[aria-label="Account"]');
    await expect(account).toBeVisible();
    await expect(account).toHaveAttribute("href", "/account");
  });

  // Version 7, Milestone 151: slimmed the footer's brand column on
  // mobile (tighter spacing, narrower centered description) — every
  // link group, the WhatsApp/review-link contact entries, policy links
  // and the newsletter shortcut must all still be there, just less
  // visually heavy up top.
  // Version 7, Milestone 167: marketplace links no longer appear in
  // the footer at all (moved to living only in the homepage's own
  // "Also Available On" section) — see shop.spec.js's "marketplace
  // links exist on homepage" test for that coverage, and this file's
  // own "no marketplace links beside the footer copyright" test below.
  // Version 7, Milestone 168F: the footer's own "Shop" group was
  // removed (pure duplication of the header's Shop link — see
  // footer.js's own comment and tests/smoke/footerCleanup.spec.js for
  // dedicated coverage of that removal). 5 groups -> 4.
  test("footer stays readable on mobile with all link groups intact", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator(".site-footer");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.locator(".footer-heading")).toHaveCount(4);
    await expect(footer.locator("a", { hasText: "My Account" })).toBeVisible();
    await expect(footer.locator("a", { hasText: "Privacy Policy" })).toBeVisible();
    await expect(footer.locator(".footer-newsletter-shortcut")).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(hasHorizontalScroll).toBe(false);
  });

  test("no marketplace links beside the footer copyright", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator(".site-footer");
    await footer.scrollIntoViewIfNeeded();
    await expect(footer.locator(".footer-marketplace")).toHaveCount(0);
    await expect(footer.locator(".site-footer__bottom")).toContainText("Seasonedz Group. All rights reserved.");
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
