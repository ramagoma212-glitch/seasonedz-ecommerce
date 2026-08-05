// Version 7, Milestone 168F: the footer's own "Shop" navigation group
// was removed (pure duplication of the header's Shop link — see
// footer.js's own comment). This suite guards the exact boundary the
// milestone brief drew: Shop must disappear from the footer only,
// while staying fully intact in the desktop header, the mobile menu,
// and the /shop route itself — and the footer's Milestone 168E payment
// trust section must be provably unaffected.
import { test, expect } from "@playwright/test";

test.describe("Footer Shop group removal", () => {
  test("footer does not contain a 'Shop' navigation heading or its old links", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer.site-footer");
    await expect(footer.locator(".footer-heading", { hasText: "Shop" })).toHaveCount(0);
    await expect(footer.getByRole("link", { name: "Physical Books" })).toHaveCount(0);
    await expect(footer.getByRole("link", { name: "Creative Supplies" })).toHaveCount(0);
    await expect(footer.getByRole("link", { name: "Best Sellers" })).toHaveCount(0);
  });

  test("footer still contains its other three groups (Help, Seasonedz Group, Legal) and Contact Us", async ({ page }) => {
    await page.goto("/");
    const footer = page.locator("footer.site-footer");
    await expect(footer.locator(".footer-heading", { hasText: "Help" })).toBeVisible();
    await expect(footer.locator(".footer-heading", { hasText: "Seasonedz Group" })).toBeVisible();
    await expect(footer.locator(".footer-heading", { hasText: "Legal" })).toBeVisible();
    await expect(footer.locator(".footer-heading", { hasText: "Contact Us" })).toBeVisible();
  });

  test("desktop header still contains a real Shop link", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.locator(".site-header").getByRole("link", { name: "Shop", exact: true })).toBeVisible();
  });

  test("mobile menu still contains a real Shop link", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto("/");
    await page.locator(".site-header__mobile-toggle").click();
    await expect(page.locator(".site-header").getByRole("link", { name: "Shop", exact: true })).toBeVisible();
  });

  test("/shop still loads with real product cards", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();
  });

  test("footer payment trust section (Milestone 168E) is unaffected: heading, copy and artwork all present", async ({ page }) => {
    await page.goto("/");
    const trust = page.locator(".footer-payment-trust");
    await expect(trust).toBeVisible();
    await expect(trust.locator(".footer-payment-trust__heading")).toHaveText("Secure Payments");
    await expect(trust.locator(".footer-payment-trust__desc")).toHaveText("Safe and convenient payment options powered by PayFast.");
    const logos = trust.locator(".footer-payment-trust__logos");
    await expect(logos).toBeVisible();
    await expect(logos).toHaveAttribute("src", /payment-methods-payfast\.webp$/);
  });

  test("footer's own grid has no empty trailing column at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const inner = page.locator(".site-footer__inner");
    const columnCount = await inner.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
    const colCount = await page.locator(".site-footer__col").count();
    // 5 real columns (Brand, Help, Seasonedz Group, Legal, Contact Us)
    // in a grid with exactly that many tracks — the last (Contact Us)
    // wraps onto its own row under column 1, not an empty visible gap
    // in row 1.
    expect(colCount).toBe(5);
    expect(columnCount).toBe(4);
  });
});
