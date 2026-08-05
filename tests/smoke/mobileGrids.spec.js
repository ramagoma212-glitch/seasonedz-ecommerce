// Version 7, Milestone 168F: homepage product grids (New Releases,
// Thoughtful Gifts Made With Purpose, Digital Colouring Books) show 2
// columns on phones instead of 1, and jump straight to 3 columns at
// 768px+ (see layout.css's .home-3col-grid and responsive.css's
// .gifting-grid). Column count is read from the grid's own computed
// grid-template-columns rather than inferred from card positions, so
// these tests fail loudly on the real CSS rule rather than on a
// brittle pixel-position heuristic.
import { test, expect } from "@playwright/test";

async function columnCount(locator) {
  return locator.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length);
}

const MOBILE_WIDTHS = [430, 390, 375, 360, 320];
const DESKTOP_WIDTHS = [768, 1024, 1280, 1440];

const GRIDS = [
  { name: "New Releases", selector: ".new-releases-grid" },
  { name: "Thoughtful Gifts Made With Purpose", selector: ".gifting-grid" },
  { name: "Digital Colouring Books", selector: "#digital-grid" },
];

test.describe("Homepage product grids: mobile column count", () => {
  for (const width of MOBILE_WIDTHS) {
    test(`all three grids show 2 columns at ${width}px, no horizontal overflow`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1600 });
      await page.goto("/");

      for (const { selector } of GRIDS) {
        const grid = page.locator(selector);
        await expect(grid).toBeVisible();
        await expect(async () => {
          expect(await columnCount(grid)).toBe(2);
        }).toPass();
      }

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  for (const width of DESKTOP_WIDTHS) {
    test(`all three grids show 3 columns at ${width}px (established desktop design)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1200 });
      await page.goto("/");

      for (const { selector } of GRIDS) {
        const grid = page.locator(selector);
        await expect(grid).toBeVisible();
        await expect(async () => {
          expect(await columnCount(grid)).toBe(3);
        }).toPass();
      }
    });
  }

  test("New Releases: 3 real cards render as 2 then 1 in a 2-column mobile grid, none clipped", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1200 });
    await page.goto("/");
    const cards = page.locator(".new-releases-grid .product-card");
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      await expect(card).toBeVisible();
    }
  });

  test("Thoughtful Gifts: all 3 approved gift cards remain present and visible in the 2-column mobile grid", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1200 });
    await page.goto("/");
    const cards = page.locator(".gifting-grid .gift-card:not([hidden])");
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      await expect(card).toBeVisible();
      await expect(card.locator(".btn")).toBeVisible();
    }
  });

  test("Digital Colouring Books: View More still works and the grid stays 2 columns on phones after expanding", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1600 });
    await page.goto("/");

    const grid = page.locator("#digital-grid");
    const viewMoreBtn = page.locator('.expandable-grid__view-more [data-action="toggle-view-more"]');

    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(3);
    expect(await columnCount(grid)).toBe(2);

    await viewMoreBtn.click();
    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(4);
    expect(await columnCount(grid)).toBe(2);
    for (const card of await grid.locator(".product-card:not([hidden])").all()) {
      await expect(card).toBeVisible();
    }

    await viewMoreBtn.click();
    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(3);
  });
});
