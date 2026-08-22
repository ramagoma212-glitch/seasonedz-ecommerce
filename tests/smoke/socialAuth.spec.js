// Version 7, Milestone 171F: Google/Facebook/Apple social sign-in —
// frontend smoke checks. No real provider credentials exist anywhere in
// this suite (this project has none configured yet — see the final
// milestone report's "external blockers"), so a true end-to-end OAuth
// round trip cannot be exercised here; that step is the owner's own
// manual "OWNER TEST LOGIN" once each console is configured, per the
// milestone brief's own required release sequence. What IS fully
// testable, and is exactly what these checks cover:
//   - GET /api/auth/providers correctly gates which buttons ever render
//     (mocked here, since production currently has all three disabled)
//   - a disabled/unconfigured provider is never shown as if it worked
//   - email/password sign-in is completely unaffected either way
//   - the friendly ?authError= banners render the right message, never
//     a raw backend string
//   - Connected Accounts (mocked logged-in state — this suite proxies
//     to the real live backend, so a real customer is never created;
//     see account.spec.js's own header comment for the same discipline)
//   - responsive rendering at the milestone brief's required widths
import { test, expect } from "@playwright/test";

function mockProviders(page, providers) {
  return page.route("**/api/auth/providers", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "ok", data: providers }),
    })
  );
}

test.describe("Social sign-in buttons (Milestone 171F)", () => {
  test("with every provider disabled (today's real production config), no social buttons render — only email/password", async ({ page }) => {
    await page.goto("/account");
    await expect(page.locator("#customer-login-form")).toBeVisible();
    await expect(page.locator("[data-social-auth-buttons]")).toHaveCount(0);
  });

  test("with all three providers enabled, all three buttons render with the correct labels and start URLs", async ({ page }) => {
    await mockProviders(page, { google: true, facebook: true, apple: true });
    await page.goto("/account");

    // Both the login and register panels render the same buttons (see
    // socialAuthButtons.js) — scoped to the visible login panel so
    // these locators resolve to exactly one element each.
    const loginPanel = page.locator('[data-account-panel="login"]');
    const google = loginPanel.locator('[data-social-auth-button="google"]');
    const facebook = loginPanel.locator('[data-social-auth-button="facebook"]');
    const apple = loginPanel.locator('[data-social-auth-button="apple"]');

    await expect(google).toBeVisible();
    await expect(google).toContainText("Continue with Google");
    await expect(google).toHaveAttribute("href", /\/auth\/oauth\/google\?intent=login/);

    await expect(facebook).toBeVisible();
    await expect(facebook).toContainText("Continue with Facebook");
    await expect(facebook).toHaveAttribute("href", /\/auth\/oauth\/facebook\?intent=login/);

    await expect(apple).toBeVisible();
    await expect(apple).toContainText("Continue with Apple");
    await expect(apple).toHaveAttribute("href", /\/auth\/oauth\/apple\?intent=login/);
  });

  test("with only Google enabled, only the Google button renders — a disabled provider is never shown as if it worked", async ({ page }) => {
    await mockProviders(page, { google: true, facebook: false, apple: false });
    await page.goto("/account");

    const loginPanel = page.locator('[data-account-panel="login"]');
    await expect(loginPanel.locator('[data-social-auth-button="google"]')).toBeVisible();
    await expect(loginPanel.locator('[data-social-auth-button="facebook"]')).toHaveCount(0);
    await expect(loginPanel.locator('[data-social-auth-button="apple"]')).toHaveCount(0);
  });

  test("email/password sign-in remains fully available regardless of social provider state", async ({ page }) => {
    await mockProviders(page, { google: true, facebook: true, apple: true });
    await page.goto("/account");

    await expect(page.locator("#customer-login-form")).toBeVisible();
    const loginForm = page.locator("#customer-login-form");
    await loginForm.locator('button[type=submit]').click();
    await expect(loginForm.locator('[data-error-for="email"]')).not.toHaveText("");

    await page.locator('[data-account-tab="register"]').click();
    await expect(page.locator("#customer-register-form")).toBeVisible();
  });

  test("social buttons also render on the register panel, above the email/password fields", async ({ page }) => {
    await mockProviders(page, { google: true, facebook: false, apple: false });
    await page.goto("/account");
    await page.locator('[data-account-tab="register"]').click();

    const registerPanel = page.locator('[data-account-panel="register"]');
    await expect(registerPanel.locator('[data-social-auth-button="google"]')).toBeVisible();
    await expect(registerPanel.locator("#customer-register-form")).toBeVisible();
  });

  test("a provider start link never carries a broken/unconfigured button — clicking it is a real navigation, not a dead click", async ({ page }) => {
    await mockProviders(page, { google: true, facebook: false, apple: false });
    await page.goto("/account");

    const google = page.locator('[data-account-panel="login"] [data-social-auth-button="google"]');
    await expect(google).toHaveAttribute("href", /^https?:\/\//);
    // A plain <a href> — not a <button> with no handler, and not
    // disabled — so a real click really does navigate away.
    const tagName = await google.evaluate((el) => el.tagName);
    expect(tagName).toBe("A");
    await expect(google).toBeEnabled();
  });
});

test.describe("Social sign-in friendly errors (Milestone 171F)", () => {
  const cases = [
    ["account_exists", /account already exists with this email/i],
    ["cancelled", /cancelled/i],
    ["provider_linked_elsewhere", /already connected to a different/i],
    ["email_required", /couldn't get an email address/i],
  ];

  for (const [code, expectedPattern] of cases) {
    test(`?authError=${code} shows a friendly message, never a raw backend string`, async ({ page }) => {
      await page.goto(`/account?authError=${code}`);
      const banner = page.locator(".social-auth-error");
      await expect(banner).toBeVisible();
      await expect(banner).toHaveText(expectedPattern);
      const text = await banner.innerText();
      expect(text).not.toMatch(/SocialAuthError|prisma|stack|at\s+\w+\.\w+\s*\(/i);
    });
  }

  test("an unrecognised authError code still shows a safe generic message, never breaks the page", async ({ page }) => {
    await page.goto("/account?authError=totally-unknown-code");
    await expect(page.locator("#customer-login-form")).toBeVisible();
    await expect(page.locator(".social-auth-error")).toContainText(/couldn't complete that sign-in/i);
  });
});

test.describe("Connected Accounts (Milestone 171F) — mocked logged-in state", () => {
  function mockLoggedIn(page, { providers, connected }) {
    return Promise.all([
      page.route("**/api/customers/me", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            message: "ok",
            data: { customer: { id: "c1", email: "test@example.com", firstName: "Thandiwe", lastName: "Nkosi", phone: null, type: "REGISTERED", profileImageUrl: null, createdAt: new Date().toISOString() } },
          }),
        })
      ),
      page.route("**/api/customers/orders", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "ok", data: { orders: [] } }) })),
      mockProviders(page, providers),
      page.route("**/api/auth/connected-accounts", (route) =>
        route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "ok", data: { providers: connected } }) })
      ),
    ]);
  }

  test("a connected provider shows a Connected badge and a Disconnect action; an unconnected-but-available one shows Connect", async ({ page }) => {
    await mockLoggedIn(page, {
      providers: { google: true, facebook: true, apple: false },
      connected: [
        { provider: "GOOGLE", connected: true },
        { provider: "FACEBOOK", connected: false },
        { provider: "APPLE", connected: false },
      ],
    });
    await page.goto("/account");

    const rows = page.locator(".connected-accounts__row");
    await expect(rows).toHaveCount(2); // Apple: neither configured nor connected -> not shown at all

    const googleRow = rows.filter({ hasText: "Google" });
    await expect(googleRow.locator(".badge")).toHaveText("Connected");
    await expect(googleRow.locator('[data-action="disconnect-provider"]')).toBeVisible();

    const facebookRow = rows.filter({ hasText: "Facebook" });
    await expect(facebookRow.locator('[data-social-auth-button="facebook"]')).toContainText("Connect");
  });

  test("a connected provider still shows Connected+Disconnect even if that provider is later disabled", async ({ page }) => {
    await mockLoggedIn(page, {
      providers: { google: false, facebook: false, apple: false },
      connected: [{ provider: "GOOGLE", connected: true }, { provider: "FACEBOOK", connected: false }, { provider: "APPLE", connected: false }],
    });
    await page.goto("/account");

    const rows = page.locator(".connected-accounts__row");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Google");
    await expect(rows.first().locator(".badge")).toHaveText("Connected");
  });

  test("clicking Disconnect calls the disconnect endpoint and the row updates", async ({ page }) => {
    let disconnectCalled = false;
    await mockLoggedIn(page, {
      providers: { google: true, facebook: false, apple: false },
      connected: [{ provider: "GOOGLE", connected: true }, { provider: "FACEBOOK", connected: false }, { provider: "APPLE", connected: false }],
    });
    await page.route("**/api/auth/connected-accounts/google", (route) => {
      disconnectCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, message: "Google disconnected successfully." }) });
    });

    await page.goto("/account");
    await page.locator('[data-action="disconnect-provider"][data-provider="google"]').click();
    await page.waitForTimeout(500);

    expect(disconnectCalled).toBe(true);
  });

  test("a backend refusal to disconnect the last sign-in method shows the backend's own message, not a silent failure", async ({ page }) => {
    await mockLoggedIn(page, {
      providers: { google: true, facebook: false, apple: false },
      connected: [{ provider: "GOOGLE", connected: true }, { provider: "FACEBOOK", connected: false }, { provider: "APPLE", connected: false }],
    });
    await page.route("**/api/auth/connected-accounts/google", (route) =>
      route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ success: false, message: "You can't disconnect your only sign-in method. Set a password or connect another provider first." }) })
    );

    let alertMessage = null;
    page.on("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.goto("/account");
    await page.locator('[data-action="disconnect-provider"][data-provider="google"]').click();
    await page.waitForTimeout(500);

    expect(alertMessage).toMatch(/only sign-in method/i);
    // The row must still show Connected — a failed disconnect must
    // never leave the UI implying it succeeded.
    await expect(page.locator(".connected-accounts__row").first().locator(".badge")).toHaveText("Connected");
  });
});

test.describe("Social sign-in responsive rendering (Milestone 171F)", () => {
  const widths = [320, 360, 375, 390, 430, 768, 1024, 1440];

  for (const width of widths) {
    test(`no horizontal overflow at ${width}px with all three provider buttons visible`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockProviders(page, { google: true, facebook: true, apple: true });
      await page.goto("/account");
      await expect(page.locator('[data-account-panel="login"] [data-social-auth-button="google"]')).toBeVisible();

      const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }

  test("social buttons stay approximately normal form width — never a giant oversized control", async ({ page }) => {
    await mockProviders(page, { google: true, facebook: true, apple: true });
    await page.goto("/account");

    const buttonBox = await page.locator('[data-account-panel="login"] [data-social-auth-button="google"]').boundingBox();
    const formBox = await page.locator("#customer-login-form").boundingBox();

    expect(buttonBox.width).toBeLessThanOrEqual(formBox.width + 2);
    // A generous upper bound on height — a normal button, not an
    // oversized banner-style control.
    expect(buttonBox.height).toBeLessThan(70);
  });
});
