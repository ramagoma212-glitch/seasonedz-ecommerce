// Version 7, Milestone 176: show/hide password toggle smoke checks.
// Covers every genuine password field discovered in the frontend audit —
// customer login, customer register (password + confirm), customer reset
// password (new + confirm), and admin login — see js/passwordToggle.js.
// No local backend runs during this suite (see account.spec.js's own
// header comment), so every test that needs a successful network
// response mocks it explicitly, same convention used throughout this
// suite; the two client-validation-only tests never call the network at
// all.
import { test, expect } from "@playwright/test";

test.describe("Password show/hide toggle", () => {
  test("login password field is hidden by default with a Show password toggle", async ({ page }) => {
    await page.goto("/account");
    const input = page.locator("#loginPassword");
    const toggle = page.locator('.password-toggle[data-target="loginPassword"]');

    await expect(input).toHaveAttribute("type", "password");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-label", "Show password");
  });

  test("clicking the toggle reveals the exact typed value and does not change it", async ({ page }) => {
    await page.goto("/account");
    const input = page.locator("#loginPassword");
    const toggle = page.locator('.password-toggle[data-target="loginPassword"]');

    await input.fill("MySecretPass123!");
    await toggle.click();

    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("MySecretPass123!");
    await expect(toggle).toHaveAttribute("aria-label", "Hide password");
  });

  test("clicking the toggle a second time hides the password again without changing the value", async ({ page }) => {
    await page.goto("/account");
    const input = page.locator("#loginPassword");
    const toggle = page.locator('.password-toggle[data-target="loginPassword"]');

    await input.fill("MySecretPass123!");
    await toggle.click();
    await toggle.click();

    await expect(input).toHaveAttribute("type", "password");
    await expect(input).toHaveValue("MySecretPass123!");
    await expect(toggle).toHaveAttribute("aria-label", "Show password");
  });

  test("clicking the toggle never submits the form", async ({ page }) => {
    await page.goto("/account");
    const toggle = page.locator('.password-toggle[data-target="loginPassword"]');

    await toggle.click();
    await toggle.click();

    // A real submit attempt on an empty form shows validation errors
    // (see account.spec.js's own "login form client validation" test) —
    // their continued absence here proves the toggle click never
    // triggered a submit.
    await expect(page.locator('#customer-login-form [data-error-for="email"]')).toHaveText("");
    await expect(page.locator('#customer-login-form [data-error-for="password"]')).toHaveText("");
    await expect(page).toHaveURL(/\/account$/);
  });

  test("toggle button is a type=button element, not a submit button", async ({ page }) => {
    await page.goto("/account");
    const toggle = page.locator('.password-toggle[data-target="loginPassword"]');
    await expect(toggle).toHaveAttribute("type", "button");
  });

  test("toggle is keyboard accessible via Enter and Space", async ({ page }) => {
    await page.goto("/account");
    const input = page.locator("#loginPassword");
    const toggle = page.locator('.password-toggle[data-target="loginPassword"]');

    await input.fill("KeyboardOnly1");
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(input).toHaveAttribute("type", "text");

    await page.keyboard.press("Space");
    await expect(input).toHaveAttribute("type", "password");
  });

  test("register form: password and confirm-password toggles are independent", async ({ page }) => {
    await page.goto("/account");
    await page.locator('[data-account-tab="register"]').click();

    const passwordInput = page.locator("#registerPassword");
    const confirmInput = page.locator("#registerConfirmPassword");
    const passwordToggle = page.locator('.password-toggle[data-target="registerPassword"]');
    const confirmToggle = page.locator('.password-toggle[data-target="registerConfirmPassword"]');

    await passwordInput.fill("PasswordOne1");
    await confirmInput.fill("PasswordOne1");

    await passwordToggle.click();
    await expect(passwordInput).toHaveAttribute("type", "text");
    // Revealing one field must never expose the other.
    await expect(confirmInput).toHaveAttribute("type", "password");
    await expect(confirmToggle).toHaveAttribute("aria-label", "Show password");

    await confirmToggle.click();
    await expect(confirmInput).toHaveAttribute("type", "text");
    await expect(passwordInput).toHaveAttribute("type", "text");
  });

  test("reset password page: new and confirm fields each have their own hidden-by-default toggle", async ({ page }) => {
    await page.goto("/account/reset-password?token=smoke-test-token-not-real");

    const newInput = page.locator("#resetPasswordNew");
    const confirmInput = page.locator("#resetPasswordConfirm");
    const newToggle = page.locator('.password-toggle[data-target="resetPasswordNew"]');
    const confirmToggle = page.locator('.password-toggle[data-target="resetPasswordConfirm"]');

    await expect(newInput).toHaveAttribute("type", "password");
    await expect(confirmInput).toHaveAttribute("type", "password");
    await expect(newToggle).toBeVisible();
    await expect(confirmToggle).toBeVisible();

    await newInput.fill("LongEnoughPassword1");
    await newToggle.click();
    await expect(newInput).toHaveValue("LongEnoughPassword1");
    await expect(confirmInput).toHaveAttribute("type", "password");
  });

  test("admin login password field is hidden by default with a working toggle", async ({ page }) => {
    await page.goto("/admin/login");
    const input = page.locator("#adminPassword");
    const toggle = page.locator('.password-toggle[data-target="adminPassword"]');

    await expect(input).toHaveAttribute("type", "password");
    await expect(toggle).toBeVisible();

    await input.fill("AdminSecret1!");
    await toggle.click();
    await expect(input).toHaveAttribute("type", "text");
    await expect(input).toHaveValue("AdminSecret1!");
    await expect(toggle).toHaveAttribute("aria-label", "Hide password");

    await toggle.click();
    await expect(input).toHaveAttribute("type", "password");
  });

  // Version 7, Milestone 176: password managers/autofill depend on
  // name/id/autocomplete/required staying exactly as they were — the
  // toggle only wraps the input in a new parent div, it must never alter
  // these attributes.
  test("password manager attributes are preserved on every password field", async ({ page }) => {
    await page.goto("/account");
    await expect(page.locator("#loginPassword")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.locator("#loginPassword")).toHaveAttribute("required", "");
    await expect(page.locator("#loginPassword")).toHaveAttribute("name", "password");

    await page.locator('[data-account-tab="register"]').click();
    await expect(page.locator("#registerPassword")).toHaveAttribute("autocomplete", "new-password");
    await expect(page.locator("#registerConfirmPassword")).toHaveAttribute("autocomplete", "new-password");

    await page.goto("/account/reset-password?token=smoke-test-token-not-real");
    await expect(page.locator("#resetPasswordNew")).toHaveAttribute("autocomplete", "new-password");
    await expect(page.locator("#resetPasswordConfirm")).toHaveAttribute("autocomplete", "new-password");

    await page.goto("/admin/login");
    await expect(page.locator("#adminPassword")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.locator("#adminPassword")).toHaveAttribute("name", "password");
  });

  // Version 7, Milestone 147/148 both fixed real 320px-only overflow
  // bugs — same viewport used here deliberately, so this regresses that
  // exact class of problem for the new toggle too.
  test("mobile: toggle does not overflow the input or cause horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto("/account");

    const scrollWidths = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidths.scrollWidth).toBeLessThanOrEqual(scrollWidths.clientWidth + 1);

    const inputBox = await page.locator("#loginPassword").boundingBox();
    const toggleBox = await page.locator('.password-toggle[data-target="loginPassword"]').boundingBox();
    expect(inputBox).not.toBeNull();
    expect(toggleBox).not.toBeNull();

    // The toggle must sit inside the input's own horizontal footprint —
    // never sticking out past its right/left edge or pushing the layout
    // wider. A 44px tap target (the accessible minimum) is intentionally
    // a little taller than the input's own text box, so it's centered on
    // the input's vertical midpoint rather than required to fit exactly
    // inside it top-to-bottom.
    expect(toggleBox.x).toBeGreaterThanOrEqual(inputBox.x);
    expect(toggleBox.x + toggleBox.width).toBeLessThanOrEqual(inputBox.x + inputBox.width + 1);
    const toggleCenterY = toggleBox.y + toggleBox.height / 2;
    const inputCenterY = inputBox.y + inputBox.height / 2;
    expect(Math.abs(toggleCenterY - inputCenterY)).toBeLessThanOrEqual(3);
  });

  test("login still works: mocked backend receives the exact typed password after a show/hide cycle", async ({ page }) => {
    let capturedBody = null;
    await page.route("**/api/customers/login", (route) => {
      capturedBody = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "Logged in successfully.", data: {} }),
      });
    });
    // The account page re-checks /me after a successful login (see
    // handleCustomerLoginSubmit's rerenderCurrentRoute()) — mocked as a
    // logged-out response so the page settles without erroring; the
    // login POST body captured above is the thing under test.
    await page.route("**/api/customers/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Not logged in." }) }));

    await page.goto("/account");
    await page.locator("#loginEmail").fill("smoke-test@example.com");
    await page.locator("#loginPassword").fill("ExactTypedPassword1!");

    const toggle = page.locator('.password-toggle[data-target="loginPassword"]');
    await toggle.click();
    await toggle.click();

    await page.locator("#customer-login-form button[type=submit]").click();
    await expect.poll(() => capturedBody).not.toBeNull();
    expect(capturedBody.password).toBe("ExactTypedPassword1!");
    expect(capturedBody.email).toBe("smoke-test@example.com");
  });

  test("registration still works: mocked backend receives the exact typed password", async ({ page }) => {
    let capturedBody = null;
    await page.route("**/api/customers/register", (route) => {
      capturedBody = route.request().postDataJSON();
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "Account created successfully.", data: {} }),
      });
    });
    await page.route("**/api/customers/me", (route) => route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ success: false, message: "Not logged in." }) }));

    await page.goto("/account");
    await page.locator('[data-account-tab="register"]').click();
    await page.locator("#registerFirstName").fill("Smoke");
    await page.locator("#registerLastName").fill("Test");
    await page.locator("#registerEmail").fill("smoke-register@example.com");
    await page.locator("#registerPassword").fill("RegisterPass1!");
    await page.locator("#registerConfirmPassword").fill("RegisterPass1!");

    await page.locator('.password-toggle[data-target="registerPassword"]').click();
    await page.locator('.password-toggle[data-target="registerConfirmPassword"]').click();

    await page.locator("#customer-register-form button[type=submit]").click();
    await expect.poll(() => capturedBody).not.toBeNull();
    expect(capturedBody.password).toBe("RegisterPass1!");
  });

  test("reset password still works: mocked backend receives the exact typed password", async ({ page }) => {
    let capturedBody = null;
    await page.route("**/api/customers/reset-password", (route) => {
      capturedBody = route.request().postDataJSON();
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, message: "Password reset successfully." }),
      });
    });

    await page.goto("/account/reset-password?token=smoke-test-token-not-real");
    await page.locator("#resetPasswordNew").fill("BrandNewPassword1!");
    await page.locator("#resetPasswordConfirm").fill("BrandNewPassword1!");

    await page.locator('.password-toggle[data-target="resetPasswordNew"]').click();

    await page.locator("#customer-reset-password-form button[type=submit]").click();
    await expect.poll(() => capturedBody).not.toBeNull();
    expect(capturedBody.password).toBe("BrandNewPassword1!");
    expect(capturedBody.confirmPassword).toBe("BrandNewPassword1!");
  });

  // Admin login validates client-side with no network call for an empty
  // submit (see app.js's handleAdminLoginSubmit) — same safe,
  // no-real-credentials-needed pattern the rest of this suite already
  // uses for customer login/register.
  test("admin login still works: client validation still fires and the toggle doesn't interfere", async ({ page }) => {
    await page.goto("/admin/login");
    const toggle = page.locator('.password-toggle[data-target="adminPassword"]');
    await toggle.click();
    await toggle.click();

    await page.locator("#admin-login-form button[type=submit]").click();
    await expect(page.locator("[data-admin-login-banner]")).toBeVisible();
    await expect(page.locator("[data-admin-login-banner]")).toContainText("Please enter your email and password.");
  });

  test("password visibility state is never persisted to localStorage or sessionStorage", async ({ page }) => {
    await page.goto("/account");
    await page.locator("#loginPassword").fill("NotPersisted1!");
    await page.locator('.password-toggle[data-target="loginPassword"]').click();

    const storage = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));
    const allKeys = [...storage.local, ...storage.session].join(" ").toLowerCase();
    expect(allKeys).not.toContain("password");
    expect(allKeys).not.toContain("visib");
  });
});
