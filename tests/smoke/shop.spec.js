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

  // Version 7, Milestone 144C: page-level slider — next/previous arrows
  // and thumbnail selection, all sharing one current-image index (see
  // js/app.js's setGalleryIndex()). PRODUCT_SLUG has 3 gallery images
  // in the static fallback data this "local" project build uses.
  test("product detail page image next and previous buttons work", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    const mainImage = page.locator(".product-details__main-image");
    const initialSrc = await mainImage.getAttribute("src");

    await page.locator(".product-details__nav--next").click();
    await expect(mainImage).not.toHaveAttribute("src", initialSrc);
    const afterNextSrc = await mainImage.getAttribute("src");

    await page.locator(".product-details__nav--prev").click();
    await expect(mainImage).toHaveAttribute("src", initialSrc);

    // Wraps around the other direction too — previous from the first
    // image lands on the last one, never a broken/empty state.
    await page.locator(".product-details__nav--prev").click();
    await expect(mainImage).not.toHaveAttribute("src", initialSrc);
    await expect(mainImage).not.toHaveAttribute("src", afterNextSrc);
  });

  test("thumbnail click selects that image and shows it as active", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    const mainImage = page.locator(".product-details__main-image");
    const initialSrc = await mainImage.getAttribute("src");
    const thirdThumb = page.locator('.product-details__thumb-btn[data-index="2"]');

    await thirdThumb.click();
    await expect(mainImage).not.toHaveAttribute("src", initialSrc);
    await expect(thirdThumb).toHaveClass(/is-active/);
    await expect(thirdThumb).toHaveAttribute("aria-current", "true");
    await expect(page.locator('.product-details__thumb-btn[data-index="0"]')).toHaveAttribute("aria-current", "false");
  });

  test("lightbox opens on the currently selected image, not always the first", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    await page.locator('.product-details__thumb-btn[data-index="2"]').click();
    const mainImageAlt = await page.locator(".product-details__main-image").getAttribute("alt");

    await page.locator(".product-details__main-image-btn").click();
    const lightbox = page.locator("#image-lightbox");
    await expect(lightbox).toBeVisible();
    await expect(lightbox.locator(".image-lightbox__image")).toHaveAttribute("alt", mainImageAlt);
  });

  test("lightbox next and previous buttons work, keyboard arrows work, Escape closes", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    await page.locator(".product-details__main-image-btn").click();
    const lightbox = page.locator("#image-lightbox");
    const lightboxImage = lightbox.locator(".image-lightbox__image");
    await expect(lightbox).toBeVisible();

    const initialAlt = await lightboxImage.getAttribute("alt");

    await lightbox.locator(".image-lightbox__nav--next").click();
    const afterNextAlt = await lightboxImage.getAttribute("alt");
    expect(afterNextAlt).not.toBe(initialAlt);

    await lightbox.locator(".image-lightbox__nav--prev").click();
    await expect(lightboxImage).toHaveAttribute("alt", initialAlt);

    await page.keyboard.press("ArrowRight");
    await expect(lightboxImage).toHaveAttribute("alt", afterNextAlt);

    await page.keyboard.press("ArrowLeft");
    await expect(lightboxImage).toHaveAttribute("alt", initialAlt);

    await page.keyboard.press("Escape");
    await expect(lightbox).toBeHidden();
  });

  // Version 7, Milestone 144C: a product with only one image must show
  // no nav arrows, no thumbnails, and no lightbox nav — mocked via
  // page.route() (same pattern as tests/smoke/account.spec.js) since
  // this "local" project's own static fallback catalogue happens to
  // give every real product more than one image.
  test("single image products show no arrows and no broken lightbox nav", async ({ page }) => {
    const singleImageProduct = {
      slug: "single-image-test-product",
      name: "Single Image Test Product",
      category: { name: "Test Category", slug: "test-category" },
      price: 99,
      image: "/images/product-1.jpg",
      gallery: [],
      shortDescription: "A test product with only one image.",
      description: "A test product with only one image.",
      features: [],
      ageRange: "All ages",
      stockStatus: "In Stock",
      tags: [],
    };

    await page.route("**/api/products", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "Products retrieved successfully.", data: { products: [singleImageProduct] } }),
      })
    );
    await page.route("**/api/categories", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Categories retrieved successfully.",
          data: { categories: [{ id: "test-category", slug: "test-category", name: "Test Category", description: "", productCount: 1 }] },
        }),
      })
    );

    await page.goto(`/product/${singleImageProduct.slug}`);
    await expect(page.locator(".product-details__main-image")).toBeVisible();
    await expect(page.locator(".product-details__nav")).toHaveCount(0);
    await expect(page.locator(".product-details__thumbs")).toHaveCount(0);

    await page.locator(".product-details__main-image-btn").click();
    const lightbox = page.locator("#image-lightbox");
    await expect(lightbox).toBeVisible();
    await expect(lightbox.locator(".image-lightbox__nav:visible")).toHaveCount(0);
  });

  // Version 7, Milestone 150: a third marketplace entry (Amazon.com)
  // was added with no verified link yet — it renders as a
  // non-clickable "coming soon" card, not an <a>, so the clickable
  // count is still 2 even though 3 cards now exist in total.
  test("marketplace links exist on homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".marketplace-card")).toHaveCount(3);

    const clickable = page.locator(".marketplace-card[href]");
    await expect(clickable).toHaveCount(2);
    for (const card of await clickable.all()) {
      await expect(card).toHaveAttribute("target", "_blank");
      await expect(card).toHaveAttribute("rel", "noopener noreferrer");
      const href = await card.getAttribute("href");
      expect(href).toMatch(/^https:\/\//);
    }

    await expect(page.locator(".marketplace-card--unavailable")).toHaveCount(1);
  });

  test("marketplace links exist in footer", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".footer-marketplace__link")).toHaveCount(3);

    const clickable = page.locator("a.footer-marketplace__link");
    await expect(clickable).toHaveCount(2);
    for (const link of await clickable.all()) {
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
