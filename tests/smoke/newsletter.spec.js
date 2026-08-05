// Version 7, Milestone 168F: homepage newsletter signup, connected to
// a real backend endpoint (POST /api/newsletter/subscribe). The
// "local" project never runs a real backend (see playwright.config.js
// header comment), so every test here mocks that one route with
// page.route() — the same pattern account.spec.js already uses for
// its own backend-dependent checks — rather than hitting a live
// server, and never sends anything close to a real subscription.
import { test, expect } from "@playwright/test";

const SUBSCRIBE_URL = "**/api/newsletter/subscribe";
const REAL_SUCCESS_MESSAGE = "Thank you. You're now signed up for Seasonedz Group updates and free printable colouring pages.";

test.describe("Newsletter signup", () => {
  test("form loads with name, email, consent copy and the honeypot hidden from view", async ({ page }) => {
    await page.goto("/");
    const form = page.locator("[data-newsletter-form]");
    await expect(form).toBeVisible();
    await expect(form.locator("#newsletter-name")).toBeVisible();
    await expect(form.locator("#newsletter-email")).toBeVisible();
    await expect(form.locator('button[type="submit"]')).toHaveText("Send Me Updates");
    await expect(form.locator(".newsletter-form__consent")).toContainText("By subscribing, you agree to receive emails from Seasonedz Group");

    // Honeypot exists in the DOM (so a bot can fill it) but is
    // clipped to nothing and out of the tab order for a real visitor —
    // deliberately NOT display:none/visibility:hidden (some bots skip
    // fields a browser would never paint), so Playwright's own
    // toBeHidden() wouldn't recognise this as hidden even though no
    // human can see or reach it. Assert on the actual clip-rect
    // technique instead (see components.css's .newsletter-form__honeypot).
    const honeypot = form.locator("#newsletter-website");
    await expect(honeypot).toHaveAttribute("tabindex", "-1");

    // The wrapper (not the input itself, which keeps its natural
    // layout size inside the clipped box) is what's actually
    // constrained to nothing visible — see components.css's
    // .newsletter-form__honeypot.
    const wrapper = form.locator(".newsletter-form__honeypot");
    const box = await wrapper.boundingBox();
    expect(box.width).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThanOrEqual(1);
    const clip = await wrapper.evaluate((el) => getComputedStyle(el).clip);
    expect(clip).toBe("rect(0px, 0px, 0px, 0px)");
  });

  test("the old permanent 'not available yet' message no longer appears anywhere on the homepage", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/sign-ups aren.t available on the website/i)).toHaveCount(0);
  });

  test("client validation blocks an empty submission before any network request", async ({ page }) => {
    let requestMade = false;
    await page.route(SUBSCRIBE_URL, (route) => {
      requestMade = true;
      route.continue();
    });

    await page.goto("/");
    await page.locator('[data-newsletter-form] button[type="submit"]').click();

    await expect(page.locator("[data-newsletter-message]")).toHaveText("Please enter your name.");
    expect(requestMade).toBe(false);
  });

  test("client validation catches an invalid email", async ({ page }) => {
    await page.goto("/");
    const form = page.locator("[data-newsletter-form]");
    await form.locator("#newsletter-name").fill("Thandiwe");
    await form.locator("#newsletter-email").fill("not-an-email");
    await form.locator('button[type="submit"]').click();

    await expect(page.locator("[data-newsletter-message]")).toHaveText("Please enter a valid email address.");
  });

  test("successful mocked subscription shows the real backend success message and disables the button", async ({ page }) => {
    await page.route(SUBSCRIBE_URL, (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: REAL_SUCCESS_MESSAGE, data: { subscribed: true } }),
      })
    );

    await page.goto("/");
    const form = page.locator("[data-newsletter-form]");
    await form.locator("#newsletter-name").fill("Thandiwe Nkosi");
    await form.locator("#newsletter-email").fill("thandiwe@example.com");
    await form.locator('button[type="submit"]').click();

    const messageEl = page.locator("[data-newsletter-message]");
    await expect(messageEl).toHaveText(REAL_SUCCESS_MESSAGE);
    await expect(messageEl).toHaveClass(/newsletter-form__message--success/);
    await expect(form.locator('button[type="submit"]')).toBeDisabled();
  });

  test("button is disabled while the request is in flight", async ({ page }) => {
    await page.route(SUBSCRIBE_URL, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: REAL_SUCCESS_MESSAGE, data: { subscribed: true } }),
      });
    });

    await page.goto("/");
    const form = page.locator("[data-newsletter-form]");
    await form.locator("#newsletter-name").fill("Thandiwe Nkosi");
    await form.locator("#newsletter-email").fill("thandiwe@example.com");
    const submitButton = form.locator('button[type="submit"]');
    await submitButton.click();

    await expect(submitButton).toBeDisabled();
  });

  test("a friendly message is shown on network failure, never a raw error, and the button re-enables", async ({ page }) => {
    await page.route(SUBSCRIBE_URL, (route) => route.abort("failed"));

    await page.goto("/");
    const form = page.locator("[data-newsletter-form]");
    await form.locator("#newsletter-name").fill("Thandiwe Nkosi");
    await form.locator("#newsletter-email").fill("thandiwe@example.com");
    const submitButton = form.locator('button[type="submit"]');
    await submitButton.click();

    const messageEl = page.locator("[data-newsletter-message]");
    await expect(messageEl).toHaveText("We could not sign you up right now. Please try again shortly.");
    await expect(messageEl).toHaveClass(/newsletter-form__message--error/);
    await expect(submitButton).toBeEnabled();
  });

  test("a backend validation error message is shown, not a generic one", async ({ page }) => {
    await page.route(SUBSCRIBE_URL, (route) =>
      route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          success: false,
          message: "Validation failed",
          errors: [{ field: "email", message: "Please enter a valid email address." }],
        }),
      })
    );

    await page.goto("/");
    const form = page.locator("[data-newsletter-form]");
    await form.locator("#newsletter-name").fill("Thandiwe Nkosi");
    // A value that passes the frontend's own lighter check but is
    // rejected server-side, to exercise the ApiError-with-field-errors
    // path specifically (see js/app.js's handleNewsletterSubmit).
    await form.locator("#newsletter-email").fill("thandiwe@example.co");
    await form.locator('button[type="submit"]').click();

    await expect(page.locator("[data-newsletter-message]")).toHaveText("Please enter a valid email address.");
  });
});
