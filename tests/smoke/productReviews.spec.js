// Version 7, Milestone 171C: genuine product reviews — frontend smoke
// checks. The "local" project never runs a real backend (see
// playwright.config.js header comment), so every backend-dependent
// check here either relies on the natural "unreachable API" fallback
// (truthful empty states) or mocks the specific route with
// page.route(), same pattern as newsletter.spec.js/account.spec.js.
import { test, expect } from "@playwright/test";

const PRODUCT_SLUG = "abc-colouring-book-for-kids-with-fun-facts";
const REVIEWS_URL = `**/api/products/${PRODUCT_SLUG}/reviews*`;

function mockLoggedInCustomer(page) {
  return page.route("**/api/customers/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "Current customer retrieved successfully.",
        data: {
          customer: {
            id: "mock-customer-id",
            email: "mock-smoke-test@example.com",
            firstName: "Mock",
            lastName: "Smoke",
            phone: "0821234567",
            type: "REGISTERED",
            createdAt: new Date().toISOString(),
          },
        },
      }),
    })
  );
}

test.describe("Fake testimonial removal (Milestone 171C, Part B)", () => {
  test("no fabricated testimonial names/quotes appear anywhere on the homepage", async ({ page }) => {
    await page.goto("/");
    for (const fabricatedName of ["Thandiwe M.", "Mrs. Dlamini", "Pastor Nkosi", "Karen S."]) {
      await expect(page.getByText(fabricatedName)).toHaveCount(0);
    }
  });

  test("the /testimonials route no longer exists in navigation or the sitemap-eligible route list", async ({ page }) => {
    await page.goto("/");
    const testimonialLinks = page.locator('a[href="/testimonials"], a[href^="/testimonials/"]');
    await expect(testimonialLinks).toHaveCount(0);
  });

  test("no sample-testimonial disclaimer copy remains", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/sample testimonials written for this preview site/i)).toHaveCount(0);
  });
});

test.describe("Genuine public product reviews (Milestone 171C, Part J)", () => {
  test("product page shows a Customer Reviews section with a truthful empty state (no backend reachable locally)", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    const section = page.locator(".product-reviews");
    await expect(section).toBeVisible();
    await expect(section.getByRole("heading", { name: "Customer Reviews" })).toBeVisible();
    await expect(section.getByText("No customer reviews yet.")).toBeVisible();
  });

  test("empty review state never shows a fake star rating or a fabricated 0.0/5", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    const section = page.locator(".product-reviews");
    await expect(section.locator(".product-reviews__summary")).toHaveCount(0);
    await expect(section.getByText(/0\.0\s*\/\s*5/)).toHaveCount(0);
  });

  test("Product JSON-LD omits aggregateRating entirely when there are zero approved reviews", async ({ page }) => {
    await page.goto(`/product/${PRODUCT_SLUG}`);
    const jsonLd = await page.evaluate(() => {
      // The per-route Product/WebSite JSON-LD (js/seo.js's
      // setPageStructuredData()) has its own id, separate from
      // index.html's static site-wide Organization/WebSite blocks — a
      // plain script[type="application/ld+json"] selector would match
      // one of those static blocks first instead (DOM order), not this
      // page's own Product data.
      const script = document.getElementById("page-structured-data");
      return script ? JSON.parse(script.textContent) : null;
    });
    expect(jsonLd).toBeTruthy();
    expect(jsonLd["@type"]).toBe("Product");
    expect(jsonLd.aggregateRating).toBeUndefined();
  });

  test("mocked approved reviews render with rating stars, review text and a privacy-safe display name", async ({ page }) => {
    await page.route(REVIEWS_URL, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Reviews retrieved successfully",
          data: {
            reviews: [
              { id: "review-1", rating: 5, reviewText: "My kids absolutely love this colouring book, wonderful quality.", displayName: "Thandiwe M.", createdAt: "2026-08-01T00:00:00.000Z" },
            ],
            total: 1,
            page: 1,
            limit: 10,
          },
        }),
      })
    );

    await page.goto(`/product/${PRODUCT_SLUG}`);
    const section = page.locator(".product-reviews");
    await expect(section.getByText("My kids absolutely love this colouring book, wonderful quality.")).toBeVisible();
    await expect(section.getByText("Thandiwe M.")).toBeVisible();
    await expect(section.locator(".product-review-card .stars")).toBeVisible();
  });
});

test.describe("Genuine review submission on the Order Detail page (Milestone 171C, Part H)", () => {
  test("logged-out customer sees the sign-in prompt, never a review form", async ({ page }) => {
    // Mocked as an explicit 401 — see the equivalent comment on the
    // "/admin/reviews requires admin auth" test below for why the
    // local project's natural "no backend running" state (a network
    // failure, not a 401) isn't the right way to exercise this path.
    await page.route("**/api/customers/orders/SG-2026-MOCK", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) })
    );
    await page.goto("/account/orders/SG-2026-MOCK");
    await expect(page.getByText("Please sign in to view this order.")).toBeVisible();
    await expect(page.locator("[data-review-form]")).toHaveCount(0);
  });

  test("eligible purchase shows a Write a Review prompt that expands into a form", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await page.route("**/api/customers/orders/SG-2026-MOCK", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Order retrieved successfully.",
          data: {
            order: {
              orderNumber: "SG-2026-MOCK",
              status: "CONFIRMED",
              paymentStatus: "PAID",
              paymentMethod: "BANK_TRANSFER",
              subtotal: 200,
              deliveryFee: 0,
              discountTotal: 0,
              total: 200,
              createdAt: new Date().toISOString(),
              customer: { firstName: "Mock", lastName: "Smoke", email: "mock-smoke-test@example.com", phone: "0821234567" },
              deliveryMethod: "COURIER_DOOR",
              collectionCity: null,
              deliveryAddress: { streetAddress: "1 Mock Street", suburb: "Mockville", city: "Pretoria", province: "Gauteng", postalCode: "0001", country: "South Africa", deliveryNotes: null },
              items: [{ productName: "Mock Colouring Book", productSlug: "mock-colouring-book", quantity: 1, unitPrice: 200, lineTotal: 200, imageUrl: null }],
              shipping: null,
            },
          },
        }),
      })
    );
    await page.route("**/api/customers/reviews/eligible", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Reviewable purchases retrieved successfully",
          data: {
            candidates: [
              { orderItemId: "item-mock-1", productId: "product-mock-1", productSlug: "mock-colouring-book", productName: "Mock Colouring Book", orderNumber: "SG-2026-MOCK", purchasedAt: new Date().toISOString() },
            ],
          },
        }),
      })
    );
    await page.route("**/api/customers/reviews", (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "ok", data: { reviews: [] } }) });
      }
      return route.continue();
    });

    await page.goto("/account/orders/SG-2026-MOCK");
    const prompt = page.locator("[data-review-prompt]");
    await expect(prompt).toBeVisible();
    const toggle = prompt.locator('[data-action="toggle-review-form"]');
    await expect(toggle).toHaveText("Write a Review");

    const form = prompt.locator("[data-review-form]");
    await expect(form).toBeHidden();
    await toggle.click();
    await expect(form).toBeVisible();
    await expect(toggle).toHaveText("Cancel");

    // Client-side validation: no rating selected yet.
    await form.locator('textarea[name="reviewText"]').fill("Great product overall, highly recommend it.");
    await form.locator('button[type="submit"]').click();
    await expect(form.locator("[data-review-form-banner]")).toHaveText("Please select a rating.");

    // Submitting a genuinely valid review (mocked success) replaces the prompt with a pending badge.
    await page.route("**/api/customers/reviews", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "Review submitted successfully. It will appear publicly once approved.",
            data: { id: "review-new", productId: "product-mock-1", productSlug: "mock-colouring-book", productName: "Mock Colouring Book", rating: 5, reviewText: "Great product overall, highly recommend it.", status: "PENDING", createdAt: new Date().toISOString() },
          }),
        });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "ok", data: { reviews: [] } }) });
    });

    await form.locator('select[name="rating"]').selectOption("5");
    await form.locator('button[type="submit"]').click();
    await expect(page.getByText("Your review: Pending approval")).toBeVisible();
  });
});

test.describe("Admin review moderation is not publicly reachable (Milestone 171C, Part I)", () => {
  test("/admin/reviews requires admin auth (redirects to admin login on a real 401)", async ({ page }) => {
    // Mocked as an explicit 401 (matching what the real backend returns
    // for this route while logged out — see requireAdminAuth.middleware.ts)
    // rather than relying on the local project's natural "no backend
    // running" ApiUnavailableError, which adminGuard.js's isUnauthenticated()
    // deliberately does NOT treat as an auth failure (see its own comment).
    await page.route("**/api/admin/reviews*", (route) =>
      route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Authentication required." }) })
    );
    await page.goto("/admin/reviews");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("no 'Add Testimonial' or 'Create Review' control exists anywhere on the site", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/add testimonial/i)).toHaveCount(0);
    await expect(page.getByText(/create (a )?(customer )?review/i)).toHaveCount(0);
  });
});
