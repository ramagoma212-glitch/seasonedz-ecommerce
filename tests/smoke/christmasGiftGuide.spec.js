import { test, expect } from "@playwright/test";

const SITE_URL = "https://www.seasonedzgroup.co.za";
const TITLE = "Christmas Colouring Gifts from R80 | Seasonedz Group";

test.describe("Christmas gift guide", () => {
  test("pre-JS HTML carries the route's own title, description and canonical for crawlers", async ({ request, baseURL }) => {
    const resp = await request.get(`${baseURL}/christmas-gift-guide`);
    expect(resp.status()).toBe(200);
    const html = await resp.text();
    expect(html).toContain(`<title>${TITLE}</title>`);
    expect(html).toContain('content="Colouring gifts for kids, families and adults, sorted by price, R80 to R250.');
    expect(html).toContain(`<link rel="canonical" href="${SITE_URL}/christmas-gift-guide/"`);
  });

  test("renders live products by price band, linked to their product pages", async ({ page }) => {
    await page.route("**/api/delivery/settings", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { courierLockerFee: 60, courierDoorFee: 90, freeDeliveryThreshold: 350 } }) })
    );
    await page.goto("/christmas-gift-guide");
    await expect(page).toHaveTitle(TITLE);
    await expect(page.locator("h1")).toHaveText("Christmas colouring gifts, sorted by price");
    await expect(page.locator(".gift-guide .product-card").first()).toBeVisible();

    const firstLink = page.locator(".gift-guide .product-card .card__title a").first();
    await expect(firstLink).toHaveAttribute("href", /^\/product\/[a-z0-9-]+$/);

    const prices = await page.locator(".gift-guide .product-card__price").allInnerTexts();
    const values = prices.map((text) => Number(text.replace(/[^0-9.]/g, "")));
    expect(values).toEqual([...values].sort((a, b) => a - b));

    await expect(page.locator(".gift-guide")).toContainText("Delivery is free once your products total R350.00 or more.");
    await expect(page.locator(".gift-guide")).not.toContainText("R600");
    await expect(page.locator('.gift-guide a[href="/schools"]').first()).toBeVisible();
    await expect(page.locator('.gift-guide a.btn[href="/shop"]')).toHaveText("Shop all gifts");
  });

  test("no horizontal page scroll at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/christmas-gift-guide");
    await expect(page.locator(".gift-guide .product-card").first()).toBeVisible();
    await page.screenshot({ path: "test-results/gift-guide-320.png", fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  for (const path of ["/", "/shop", "/blog"]) {
    test(`${path} links to the gift guide`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main a[href="/christmas-gift-guide"]').first()).toBeAttached({ timeout: 15000 });
    });
  }
});
