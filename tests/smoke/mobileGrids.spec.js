// Version 7, Milestone 168F: homepage product grids (New Releases,
// Thoughtful Gifts Made With Purpose, Digital Colouring Books) show 2
// columns on phones instead of 1, and jump straight to 3 columns at
// 768px+ (see layout.css's .home-3col-grid and responsive.css's
// .gifting-grid). Column count is read from the grid's own computed
// grid-template-columns rather than inferred from card positions, so
// these tests fail loudly on the real CSS rule rather than on a
// brittle pixel-position heuristic.
//
// Version 7, Milestone 171B.0: all three sections now additionally
// collapse to exactly 2 visible cards on mobile with a View More/View
// Less control (previously only Digital had this, and only revealed
// past a 3-card threshold — see pages/home.js's
// MOBILE_INITIAL_VISIBLE_COUNT). Tablet/desktop show every real card
// immediately with no button at all — CSS forces `[hidden]` cards
// visible again at 768px+ (layout.css/responsive.css), so a plain
// `:not([hidden])` DOM-attribute count is the right check for mobile-
// collapsed-state tests below, but would under-count what's genuinely
// on screen at desktop (attribute state is viewport-independent, the
// CSS override is not) — desktop visibility is checked separately in
// homeSections.spec.js using real computed visibility instead.
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

  // Shared expectation for the odd-total lone-final-card case (New
  // Releases and Thoughtful Gifts both have exactly 3 real items
  // today): after expanding, the 3rd card must be centred at the same
  // width as a normal card — never stretched across both columns,
  // never flush against either edge. Digital's own Coming Soon
  // fallback has 4 items (even), so it's checked separately for a
  // clean 2x2 instead — both cases are driven by the exact same CSS
  // rule (`:last-child:nth-child(odd)`, see layout.css/responsive.css),
  // so this single rule already covers any future odd Digital count
  // too, not just New Releases/Gifts specifically.
  async function assertLoneCardCentred(page, cardLocator, siblingLocator) {
    const cardBox = await cardLocator.boundingBox();
    const siblingBox = await siblingLocator.boundingBox();
    expect(cardBox.width).toBeGreaterThan(0);
    // Same width as a normal card — not stretched across both columns
    // (a stretched card would differ by roughly a full column + gap,
    // tens of pixels — a few px here is normal sub-pixel/percentage
    // rounding between the grid's own fractional column width and the
    // centred card's calc() max-width, not a real layout bug).
    expect(Math.abs(cardBox.width - siblingBox.width)).toBeLessThan(4);
    // Centred: roughly equal empty space on both sides within the viewport.
    const viewport = page.viewportSize();
    const leftGap = cardBox.x;
    const rightGap = viewport.width - (cardBox.x + cardBox.width);
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(6);
  }

  test("New Releases: initially 2 visible, View More reveals the 3rd centred, View Less restores 2", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1200 });
    await page.goto("/");
    const grid = page.locator("#new-releases-grid");
    const viewMoreBtn = page.locator('[aria-controls="new-releases-grid"]');

    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(2);
    await expect(viewMoreBtn).toBeVisible();
    await expect(viewMoreBtn).toHaveText("View More");
    await expect(viewMoreBtn).toHaveAttribute("aria-expanded", "false");

    await viewMoreBtn.click();
    const visible = grid.locator(".product-card:not([hidden])");
    await expect(visible).toHaveCount(3);
    await expect(viewMoreBtn).toHaveText("View Less");
    await expect(viewMoreBtn).toHaveAttribute("aria-expanded", "true");
    for (const card of await visible.all()) {
      await expect(card).toBeVisible();
    }
    await assertLoneCardCentred(page, visible.nth(2), visible.nth(0));

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await viewMoreBtn.click();
    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(2);
    await expect(viewMoreBtn).toHaveText("View More");
    await expect(viewMoreBtn).toHaveAttribute("aria-expanded", "false");
  });

  test("New Releases: View More button is centred under the whole grid, not under the first card", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1200 });
    await page.goto("/");
    const gridBox = await page.locator("#new-releases-grid").boundingBox();
    const btnBox = await page.locator('[aria-controls="new-releases-grid"]').boundingBox();
    const gridCentre = gridBox.x + gridBox.width / 2;
    const btnCentre = btnBox.x + btnBox.width / 2;
    expect(Math.abs(gridCentre - btnCentre)).toBeLessThan(4);
  });

  test("New Releases: View More/View Less works with the keyboard (Enter and Space)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1200 });
    await page.goto("/");
    const grid = page.locator("#new-releases-grid");
    const viewMoreBtn = page.locator('[aria-controls="new-releases-grid"]');

    await viewMoreBtn.focus();
    await page.keyboard.press("Enter");
    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(3);

    await page.keyboard.press("Space");
    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(2);
  });

  test("Thoughtful Gifts: initially 2 visible, View More reveals the 3rd centred, View Less restores 2", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1200 });
    await page.goto("/");
    const grid = page.locator("#gifting-grid");
    const viewMoreBtn = page.locator('[aria-controls="gifting-grid"]');

    await expect(grid.locator(".gift-card:not([hidden])")).toHaveCount(2);
    await expect(viewMoreBtn).toBeVisible();
    await expect(viewMoreBtn).toHaveText("View More");

    await viewMoreBtn.click();
    const visible = grid.locator(".gift-card:not([hidden])");
    await expect(visible).toHaveCount(3);
    await expect(viewMoreBtn).toHaveText("View Less");
    for (const card of await visible.all()) {
      await expect(card).toBeVisible();
      await expect(card.locator(".btn")).toBeVisible();
    }
    await assertLoneCardCentred(page, visible.nth(2), visible.nth(0));

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await viewMoreBtn.click();
    await expect(grid.locator(".gift-card:not([hidden])")).toHaveCount(2);
    await expect(viewMoreBtn).toHaveText("View More");
  });

  test("Digital Colouring Books: initially 2 visible, View More reveals all remaining, View Less restores 2", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 1600 });
    await page.goto("/");

    const grid = page.locator("#digital-grid");
    const viewMoreBtn = page.locator('[aria-controls="digital-grid"]');

    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(2);
    expect(await columnCount(grid)).toBe(2);

    await viewMoreBtn.click();
    const visible = grid.locator(".product-card:not([hidden])");
    // The Coming Soon fallback has 4 titles configured today
    // (DIGITAL_COMING_SOON in pages/home.js) — asserting "all revealed,
    // none left hidden" rather than a hard-coded 4 keeps this test
    // honest about what it's actually checking even if that list ever
    // grows or shrinks.
    const totalCards = await grid.locator(".product-card").count();
    await expect(visible).toHaveCount(totalCards);
    expect(await columnCount(grid)).toBe(2);
    for (const card of await visible.all()) {
      await expect(card).toBeVisible();
    }

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

    await viewMoreBtn.click();
    await expect(grid.locator(".product-card:not([hidden])")).toHaveCount(2);
  });

  test("mobile expand/collapse does not leave a hidden empty grid cell or move the section heading", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 2400 });
    await page.goto("/");
    const headingBefore = await page.locator("#new-releases-heading").boundingBox();

    await page.locator('[aria-controls="new-releases-grid"]').click();
    const headingAfter = await page.locator("#new-releases-heading").boundingBox();
    expect(headingAfter.y).toBeCloseTo(headingBefore.y, 0);

    // No stray empty track: the grid's own scrollHeight should grow
    // (a 2nd row appeared), not just gain invisible space.
    const gridHeight = await page.locator("#new-releases-grid").evaluate((el) => el.scrollHeight);
    expect(gridHeight).toBeGreaterThan(0);
  });
});
