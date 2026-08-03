// Version 7, Milestone 128: customer account frontend smoke checks.
// GET /api/customers/me is proxied to the real live backend (same
// convention as every other API call in this suite — see
// safety.spec.js's own header comment) — while logged out (the only
// state a fresh Playwright browser context can ever be in here), it
// correctly 401s and the page shows the logged-out login/register
// view, so these checks never create any real Customer row. Deliberate
// exception: the two client-validation tests submit each form with
// nothing filled in, which is rejected before any network call is
// ever made (see js/app.js's handleCustomerRegisterSubmit/
// handleCustomerLoginSubmit — validation runs first, and only calls
// the backend once it passes) — still zero real accounts created.
import { test, expect } from "@playwright/test";

test.describe("Customer account smoke checks", () => {
  test("account page loads and shows the logged-out view", async ({ page }) => {
    await page.goto("/account");
    await expect(page.locator("#customer-login-form")).toBeVisible();
    await expect(page.locator('[data-account-tab="register"]')).toBeVisible();
  });

  test("register form client validation works without creating an account", async ({ page }) => {
    await page.goto("/account");
    await page.locator('[data-account-tab="register"]').click();
    const registerForm = page.locator("#customer-register-form");
    await expect(registerForm).toBeVisible();

    await registerForm.locator('button[type=submit]').click();
    await expect(registerForm.locator('[data-error-for="firstName"]')).not.toHaveText("");
    await expect(registerForm.locator('[data-error-for="email"]')).not.toHaveText("");
    await expect(registerForm.locator('[data-error-for="password"]')).not.toHaveText("");
  });

  test("login form client validation works without a network call", async ({ page }) => {
    await page.goto("/account");
    const loginForm = page.locator("#customer-login-form");
    await loginForm.locator('button[type=submit]').click();
    await expect(loginForm.locator('[data-error-for="email"]')).not.toHaveText("");
    await expect(loginForm.locator('[data-error-for="password"]')).not.toHaveText("");
  });

  // Version 7, Milestone 150 removed "My Account" from the primary
  // header nav; Milestone 151 restored it as its own icon link in
  // .site-header__actions (customers couldn't otherwise find where to
  // log in/register) — positioned before Wishlist/Cart per the
  // "Logo -> Nav -> Search -> Account -> Wishlist -> Cart" order.
  test("header has a visible Account link that goes to /account", async ({ page }) => {
    await page.goto("/");
    const accountLink = page.locator('.site-header a.icon-link[aria-label="Account"]');
    await expect(accountLink).toBeVisible();
    await expect(accountLink).toHaveAttribute("href", "/account");

    await accountLink.click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("footer Help section has a My Account link that goes to /account", async ({ page }) => {
    await page.goto("/");
    const footerAccountLink = page.locator(".site-footer a", { hasText: "My Account" });
    await expect(footerAccountLink).toBeVisible();
    await expect(footerAccountLink).toHaveAttribute("href", "/account");
  });

  test("guest checkout still loads without requiring an account", async ({ page }) => {
    await page.goto("/shop");
    await page.locator('[data-action="add-to-cart"]').first().click();
    await page.goto("/checkout");
    await expect(page.locator("form").first()).toBeVisible();
    // Deliberately stops here — never fills in or submits the form.
  });

  // Version 7, Milestone 121/122: VITE_PAYFAST_ENABLED is correctly
  // unset (defaults false) in this suite's own local build — same as
  // every other local dev build — so PayFast legitimately shows as
  // "Coming Soon" here. Whether it's actually selectable live is
  // already verified against the real backend by safety.spec.js's own
  // "PayFast initiate" check; this test only confirms the option still
  // renders at all (this milestone didn't break checkout's payment
  // method list).
  test("PayFast payment option still present at checkout", async ({ page }) => {
    await page.goto("/shop");
    await page.locator('[data-action="add-to-cart"]').first().click();
    await page.goto("/checkout");

    const payfastOption = page.locator(".payment-method", { hasText: "PayFast" });
    await expect(payfastOption).toBeVisible();
  });

  test("admin login stays separate from the customer account page", async ({ page }) => {
    await page.goto("/account");
    const adminLinks = page.locator('a[href*="/admin"]');
    expect(await adminLinks.count()).toBe(0);
  });

  // Version 7, Milestone 129: no local backend runs during this suite,
  // so GET /api/customers/me naturally fails (nothing listening on the
  // fallback localhost URL) and checkoutPage.js's own try/catch treats
  // that exactly like a logged-out 401 — no mocking needed for this
  // one. Confirms the soft, non-blocking sign-in invitation renders and
  // never replaces or hides any of the checkout form.
  test("checkout shows the optional sign-in note when logged out", async ({ page }) => {
    await page.goto("/shop");
    await page.locator('[data-action="add-to-cart"]').first().click();
    await page.goto("/checkout");

    await expect(page.getByText("Have an account?")).toBeVisible();
    await expect(page.locator('a[href="/account"]', { hasText: "Sign in" })).toBeVisible();
    await expect(page.locator("#checkout-form")).toBeVisible();
  });

  // Version 7, Milestone 130: shared mock helper for /api/customers/me —
  // used by both the checkout-prefill test below and the new My Orders
  // tests, so each test only has to add its own /customers/orders* mock.
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

  // Mocks GET /api/customers/me only — the one call checkoutPage.js
  // makes to decide logged-in vs. guest — so this exercises the real
  // prefill code path without ever touching a real account or the live
  // backend. Order creation itself is never invoked in this test.
  test("logged-in checkout prefills customer details from a mocked session", async ({ page }) => {
    await mockLoggedInCustomer(page);

    await page.goto("/shop");
    await page.locator('[data-action="add-to-cart"]').first().click();
    await page.goto("/checkout");

    await expect(page.getByText("Signed in as mock-smoke-test@example.com")).toBeVisible();
    await expect(page.locator("#firstName")).toHaveValue("Mock");
    await expect(page.locator("#lastName")).toHaveValue("Smoke");
    await expect(page.locator("#email")).toHaveValue("mock-smoke-test@example.com");
    await expect(page.locator("#phone")).toHaveValue("0821234567");
    // Deliberately stops here — never submits the form or creates an order.
  });

  // Version 7, Milestone 131: writes a synthetic cart directly into
  // Local Storage (same shape/key as js/cart.js) so the subtotal is
  // deterministic, rather than depending on real product prices —
  // never touches a real order or the live backend either way.
  // Version 7, Milestone 159A: accepts an optional `giftWrap` flag so
  // the same helper can build the exact product-subtotal + gift-wrap
  // combinations needed to verify gift wrapping is excluded from the
  // R650 free-delivery threshold (giftWrap fee is quantity * R30, same
  // rule as js/cart.js's GIFT_WRAP_FEE_PER_ITEM).
  async function setSyntheticCart(page, { price, quantity, giftWrap = false }) {
    await page.goto("/");
    await page.evaluate(
      ({ price, quantity, giftWrap }) => {
        localStorage.setItem(
          "seasonedz_cart",
          JSON.stringify([{ productId: "mock-product-id", slug: "mock-product", name: "Mock Product", price, quantity, image: null, productType: "PHYSICAL", giftWrap, giftMessage: giftWrap ? "Test message" : null }])
        );
      },
      { price, quantity, giftWrap }
    );
  }

  test("logged-in checkout shows free delivery when subtotal is R650 or more", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await setSyntheticCart(page, { price: 250, quantity: 3 }); // subtotal R750

    await page.goto("/checkout");
    await expect(page.getByText("Free delivery applied for your registered Seasonedz Group account.")).toBeVisible();
    await expect(page.locator(".order-summary__row", { hasText: "Delivery" }).getByText("Free")).toBeVisible();

    // No auth token ever touches localStorage — only the plain cart
    // array (already asserted elsewhere to contain no session data).
    const localStorageKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(localStorageKeys.every((key) => !key.toLowerCase().includes("session") && !key.toLowerCase().includes("token"))).toBe(true);
  });

  test("logged-in checkout shows R80 delivery when subtotal is below R650", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await setSyntheticCart(page, { price: 100, quantity: 2 }); // subtotal R200

    await page.goto("/checkout");
    await expect(page.getByText("Registered customers get free delivery on orders of R650 or more.")).toBeVisible();
    await expect(page.locator(".order-summary__row", { hasText: "Delivery" }).getByText("R80.00")).toBeVisible();
  });

  // Version 7, Milestone 159A: gift wrapping must NOT count towards the
  // R650 free-delivery threshold — only the product subtotal decides
  // eligibility (see js/cart.js's getCartSummary(), which calls
  // calculateDeliveryFee(subtotal, ...) using the product-only subtotal,
  // BEFORE giftWrapTotal is added to the displayed order total). These
  // four cases are the exact scenarios from the milestone brief.
  test("R620 products + R30 gift wrap: still charged delivery (product subtotal alone decides, R620 < R650)", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await setSyntheticCart(page, { price: 620, quantity: 1, giftWrap: true }); // subtotal R620, gift wrap R30

    await page.goto("/checkout");
    await expect(page.locator(".order-summary__row", { hasText: "Subtotal" })).toContainText("620.00");
    await expect(page.locator(".order-summary__row", { hasText: "Gift wrapping" })).toContainText("30.00");
    await expect(page.getByText("Registered customers get free delivery on orders of R650 or more.")).toBeVisible();
    await expect(page.locator(".order-summary__row", { hasText: "Delivery" }).getByText("R80.00")).toBeVisible();
  });

  test("R650 products + R30 gift wrap: free delivery (product subtotal itself already reaches R650)", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await setSyntheticCart(page, { price: 650, quantity: 1, giftWrap: true }); // subtotal R650, gift wrap R30

    await page.goto("/checkout");
    await expect(page.locator(".order-summary__row", { hasText: "Subtotal" })).toContainText("650.00");
    await expect(page.locator(".order-summary__row", { hasText: "Gift wrapping" })).toContainText("30.00");
    await expect(page.getByText("Free delivery applied for your registered Seasonedz Group account.")).toBeVisible();
    await expect(page.locator(".order-summary__row", { hasText: "Delivery" }).getByText("Free")).toBeVisible();
  });

  test("R640 products + R60 gift wrap (2 wrapped items): still charged delivery (R640 < R650)", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await setSyntheticCart(page, { price: 320, quantity: 2, giftWrap: true }); // subtotal R640, gift wrap R60 (2 x R30)

    await page.goto("/checkout");
    await expect(page.locator(".order-summary__row", { hasText: "Subtotal" })).toContainText("640.00");
    await expect(page.locator(".order-summary__row", { hasText: "Gift wrapping" })).toContainText("60.00");
    await expect(page.getByText("Registered customers get free delivery on orders of R650 or more.")).toBeVisible();
    await expect(page.locator(".order-summary__row", { hasText: "Delivery" }).getByText("R80.00")).toBeVisible();
  });

  test("R700 products + no gift wrap: free delivery as normal", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await setSyntheticCart(page, { price: 700, quantity: 1, giftWrap: false }); // subtotal R700, no gift wrap

    await page.goto("/checkout");
    await expect(page.locator(".order-summary__row", { hasText: "Subtotal" })).toContainText("700.00");
    await expect(page.locator(".order-summary__row", { hasText: "Gift wrapping" })).toHaveCount(0);
    await expect(page.getByText("Free delivery applied for your registered Seasonedz Group account.")).toBeVisible();
    await expect(page.locator(".order-summary__row", { hasText: "Delivery" }).getByText("Free")).toBeVisible();
  });

  // Version 7, Milestone 130: My Orders — every /customers/orders* call
  // is mocked, so none of these tests ever touch a real account or the
  // live backend.
  test("logged-in account with no orders shows the empty state", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await page.route("**/api/customers/orders", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "Orders retrieved successfully.", data: { orders: [] } }) })
    );

    await page.goto("/account");
    await expect(page.getByText("You do not have any account orders yet.")).toBeVisible();
    await expect(page.locator(".account-orders a[href=\"/track-order\"]", { hasText: "Track Order" })).toBeVisible();
  });

  test("logged-in account with mocked orders shows an order card", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await page.route("**/api/customers/orders", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          message: "Orders retrieved successfully.",
          data: {
            orders: [
              {
                orderNumber: "SG-2026-MOCK",
                status: "CONFIRMED",
                paymentStatus: "PAID",
                paymentMethod: "BANK_TRANSFER",
                subtotal: 200,
                deliveryFee: 0,
                total: 200,
                createdAt: new Date().toISOString(),
                itemCount: 2,
                firstItemName: "Mock Colouring Book",
                firstItemImageUrl: null,
              },
            ],
          },
        }),
      })
    );

    await page.goto("/account");
    await expect(page.getByText("SG-2026-MOCK")).toBeVisible();
    await expect(page.locator('a[href="/account/orders/SG-2026-MOCK"]', { hasText: "View Details" })).toBeVisible();
  });

  test("order detail page renders safe mocked order data", async ({ page }) => {
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
              deliveryAddress: { streetAddress: "1 Mock Street", suburb: "Mockville", city: "Pretoria", province: "Gauteng", postalCode: "0001", country: "South Africa", deliveryNotes: null },
              items: [{ productName: "Mock Colouring Book", productSlug: "mock-colouring-book", quantity: 2, unitPrice: 100, lineTotal: 200, imageUrl: null }],
              shipping: { status: "NOT_STARTED", courierName: null, trackingNumber: null, trackingUrl: null, estimatedDelivery: null, shippedAt: null, deliveredAt: null },
            },
          },
        }),
      })
    );

    await page.goto("/account/orders/SG-2026-MOCK");
    await expect(page.getByText("SG-2026-MOCK")).toBeVisible();
    await expect(page.getByText("Mock Colouring Book")).toBeVisible();
    await expect(page.getByText("R200.00").first()).toBeVisible();
  });

  test("order detail page shows a safe not-found message on 404", async ({ page }) => {
    await mockLoggedInCustomer(page);
    await page.route("**/api/customers/orders/SG-2026-NOPE", (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ success: false, message: "Order not found in this account." }) })
    );

    await page.goto("/account/orders/SG-2026-NOPE");
    await expect(page.getByText("Order not found in this account.")).toBeVisible();
  });

  test("public track-order page still works for guests", async ({ page }) => {
    await page.goto("/track-order");
    await expect(page.locator("#track-order-form")).toBeVisible();
  });

  // Version 7, Milestone 132: forgot/reset password. Neither endpoint
  // is called for real in the "local" project (no local backend runs
  // during this suite — see this file's own header comment) — the one
  // test that needs a successful response mocks it explicitly, same
  // convention as mockLoggedInCustomer() above.
  test("login page has a Forgot password link", async ({ page }) => {
    await page.goto("/account");
    const link = page.locator('#customer-login-form a[href="/account/forgot-password"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveText("Forgot password?");
  });

  test("forgot password page loads", async ({ page }) => {
    await page.goto("/account/forgot-password");
    await expect(page.locator("#customer-forgot-password-form")).toBeVisible();
    await expect(page.locator("#forgotPasswordEmail")).toBeVisible();
  });

  test("forgot password form validates email client-side without a network call", async ({ page }) => {
    await page.goto("/account/forgot-password");
    const form = page.locator("#customer-forgot-password-form");
    await form.locator('button[type=submit]').click();
    await expect(form.locator('[data-error-for="email"]')).not.toHaveText("");
  });

  // The backend always returns the same generic message regardless of
  // whether the email matches a real account (see
  // backend/src/controllers/customerAuth.controller.ts's
  // forgotPasswordHandler) — mocked here purely so the test doesn't
  // depend on a live backend connection; the message itself is never
  // account-specific either way.
  test("forgot password success message is generic", async ({ page }) => {
    await page.route("**/api/customers/forgot-password", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "If an account exists for that email, a reset link has been sent." }),
      })
    );

    await page.goto("/account/forgot-password");
    await page.locator("#forgotPasswordEmail").fill("someone@example.com");
    await page.locator("#customer-forgot-password-form button[type=submit]").click();

    await expect(page.getByText("If an account exists for that email, a reset link has been sent.")).toBeVisible();
    await expect(page.locator("#customer-forgot-password-form")).toBeHidden();
  });

  test("reset password page loads with a token present in the URL", async ({ page }) => {
    await page.goto("/account/reset-password?token=smoke-test-token-not-real");
    await expect(page.locator("#customer-reset-password-form")).toBeVisible();
    await expect(page.locator("#resetPasswordNew")).toBeVisible();
    await expect(page.locator("#resetPasswordConfirm")).toBeVisible();
  });

  test("reset password page without a token shows a safe invalid-link message", async ({ page }) => {
    await page.goto("/account/reset-password");
    await expect(page.locator("#customer-reset-password-form")).toHaveCount(0);
    await expect(page.getByText("This reset link is invalid or has expired.")).toBeVisible();
  });

  test("reset password validates minimum password length", async ({ page }) => {
    await page.goto("/account/reset-password?token=smoke-test-token-not-real");
    const form = page.locator("#customer-reset-password-form");
    await form.locator("#resetPasswordNew").fill("short");
    await form.locator("#resetPasswordConfirm").fill("short");
    await form.locator('button[type=submit]').click();
    await expect(form.locator('[data-error-for="password"]')).not.toHaveText("");
  });

  test("reset password validates that confirm password matches", async ({ page }) => {
    await page.goto("/account/reset-password?token=smoke-test-token-not-real");
    const form = page.locator("#customer-reset-password-form");
    await form.locator("#resetPasswordNew").fill("LongEnoughPassword1");
    await form.locator("#resetPasswordConfirm").fill("DoesNotMatch1");
    await form.locator('button[type=submit]').click();
    await expect(form.locator('[data-error-for="confirmPassword"]')).not.toHaveText("");
  });
});
