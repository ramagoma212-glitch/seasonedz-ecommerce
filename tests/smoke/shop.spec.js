// Version 7, Milestone 103: shopping-flow smoke checks. Never submits
// checkout or creates an order — cart/wishlist actions here only ever
// add-then-remove, and each test gets Playwright's own fresh browser
// context (isolated localStorage), so nothing leaks between tests or
// needs manual cleanup. Uses one pinned, long-lived catalogue slug
// (abc-colouring-book-for-kids-with-fun-facts) as a stable anchor —
// everything else asserts structure (a card renders, an image isn't
// broken), never exact prices, names or counts, since real product
// data can grow or change without that being a regression.
import { test, expect } from "@playwright/test";

const PRODUCT_SLUG = "abc-colouring-book-for-kids-with-fun-facts";

test.describe("Shopping smoke checks", () => {
  test("homepage and shop product cards render, no broken images", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".product-card").first()).toBeVisible();

    await page.goto("/shop");
    const cards = page.locator(".product-card");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);

    const broken = await page.evaluate(
      () => Array.from(document.querySelectorAll("img")).filter((img) => img.complete && img.naturalWidth === 0).length
    );
    expect(broken).toBe(0);
  });

  test("product detail opens, no demo review stars", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    await expect(page.locator(".product-details__main-image")).toBeVisible();

    const detailStars = await page.locator(".product-details__rating").count();
    expect(detailStars).toBe(0);
  });

  test("no demo review stars on product cards", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();

    const cardStars = await page.locator(".product-card__rating, .product-card__review-count").count();
    expect(cardStars).toBe(0);
  });

  test("add to cart, cart image renders, remove from cart", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();
    await page.locator('[data-action="add-to-cart"]').first().click();
    await expect(page.locator('[data-badge="cart"]')).toHaveText("1");

    await page.goto("/cart");
    const cartImg = page.locator(".cart-item img").first();
    await expect(cartImg).toBeVisible();
    await expect
      .poll(async () => cartImg.evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true);

    await page.locator('[data-action="cart-remove"]').first().click();
    await expect(page.locator(".cart-item")).toHaveCount(0);
  });

  test("wishlist add and remove", async ({ page }) => {
    await page.goto("/shop");
    await expect(page.locator(".product-card").first()).toBeVisible();
    await page.locator('[data-action="toggle-wishlist"]').first().click();
    await expect(page.locator('[data-badge="wishlist"]')).toHaveText("1");

    await page.goto("/wishlist");
    await expect(page.locator(".wishlist-item").first()).toBeVisible();
    await page.locator('[data-action="wishlist-remove"]').first().click();
    await expect(page.locator(".wishlist-item")).toHaveCount(0);
  });

  // Version 7, Milestone 144: product image lightbox. Covers the main
  // image trigger plus all three ways of closing it (close button,
  // Escape, clicking outside the enlarged image) in one test.
  test("product image lightbox opens and closes", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    const lightbox = page.locator("#image-lightbox");
    const mainImageBtn = page.locator(".product-details__main-image-btn");

    await mainImageBtn.click();
    await expect(lightbox).toBeVisible();
    await expect(lightbox.locator(".image-lightbox__image")).toHaveAttribute("alt", /.+/);

    await lightbox.locator(".image-lightbox__close").click();
    await expect(lightbox).toBeHidden();

    await mainImageBtn.click();
    await expect(lightbox).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();

    await mainImageBtn.click();
    await expect(lightbox).toBeVisible();
    await lightbox.click({ position: { x: 2, y: 2 } });
    await expect(lightbox).toBeHidden();
  });

  test("marketplace links exist on homepage", async ({ page }) => {
    await page.goto("/");
    const cards = page.locator(".marketplace-card");
    await expect(cards).toHaveCount(2);

    for (const card of await cards.all()) {
      await expect(card).toHaveAttribute("target", "_blank");
      await expect(card).toHaveAttribute("rel", "noopener noreferrer");
      const href = await card.getAttribute("href");
      expect(href).toMatch(/^https:\/\//);
    }
  });

  test("marketplace links exist in footer", async ({ page }) => {
    await page.goto("/");
    const links = page.locator(".footer-marketplace__link");
    await expect(links).toHaveCount(2);

    for (const link of await links.all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
