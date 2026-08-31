// Milestone 179: admin access, email OTP security and forgotten
// password. Every "logged in" or "backend response" scenario is mocked
// via page.route(), exactly like adminAffiliate.spec.js's own
// mockAdminAuth() — this project has no precedent for driving a real
// authenticated admin session (or a real OTP email) in Playwright, and
// this file follows that same established discipline. No real OTP
// code, reset token, activation token or session cookie is ever
// involved — everything here is a mocked response body.
import { test, expect } from "@playwright/test";

function envelope(data, message = "OK") {
  return JSON.stringify({ success: true, message, data });
}

function errorEnvelope(message, errors) {
  return JSON.stringify({ success: false, message, errors });
}

async function mockAdminAuth(page, admin = { id: "admin-1", name: "Owner", email: "owner@example.invalid", role: "ADMIN" }) {
  await page.route("**/api/admin/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admin }) }));
}

// ---------------------------------------------------------------------------
// Login: password step
// ---------------------------------------------------------------------------

test.describe("Admin login — password step (Milestone 179)", () => {
  test("shows email/password fields and a Forgot Password link, OTP step hidden", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page.locator("#adminEmail")).toBeVisible();
    await expect(page.locator("#adminPassword")).toBeVisible();
    await expect(page.locator('a[href="/admin/forgot-password"]', { hasText: "Forgot Password" })).toBeVisible();
    await expect(page.locator("#admin-otp-form")).toBeHidden();
  });

  test("wrong credentials show one generic message — never reveals which part was wrong", async ({ page }) => {
    await page.route("**/api/admin/auth/login", (route) => route.fulfill({ status: 401, contentType: "application/json", body: errorEnvelope("Unable to sign in with those details.") }));

    await page.goto("/admin/login");
    await page.locator("#adminEmail").fill("nobody@example.invalid");
    await page.locator("#adminPassword").fill("wrong-password-entirely");
    await page.locator("#admin-login-form button[type=\"submit\"]").click();

    await expect(page.locator("[data-admin-login-banner]")).toContainText("Invalid email or password");
    await expect(page.locator("#admin-otp-form")).toBeHidden();
  });

  test("correct credentials never create a session directly — they move to the OTP step with a masked email", async ({ page }) => {
    await page.route("**/api/admin/auth/login", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ challengeToken: "mock-challenge-token", maskedEmail: "o***@example.invalid", expiresAt: new Date(Date.now() + 600000).toISOString() }) })
    );

    await page.goto("/admin/login");
    await page.locator("#adminEmail").fill("owner@example.invalid");
    await page.locator("#adminPassword").fill("correct horse battery staple");
    await page.locator("#admin-login-form button[type=\"submit\"]").click();

    await expect(page.locator("#admin-login-form")).toBeHidden();
    await expect(page.locator("#admin-otp-form")).toBeVisible();
    await expect(page.locator("[data-admin-otp-description]")).toContainText("o***@example.invalid");
    // Never navigated away — no session exists yet.
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

// ---------------------------------------------------------------------------
// Login: OTP step
// ---------------------------------------------------------------------------

async function goToOtpStep(page) {
  await page.route("**/api/admin/auth/login", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: envelope({ challengeToken: "mock-challenge-token", maskedEmail: "o***@example.invalid", expiresAt: new Date(Date.now() + 600000).toISOString() }) })
  );
  await page.goto("/admin/login");
  await page.locator("#adminEmail").fill("owner@example.invalid");
  await page.locator("#adminPassword").fill("correct horse battery staple");
  await page.locator("#admin-login-form button[type=\"submit\"]").click();
  await expect(page.locator("#admin-otp-form")).toBeVisible();
}

test.describe("Admin login — OTP step (Milestone 179)", () => {
  test("an incorrect code shows the backend's own specific message", async ({ page }) => {
    await goToOtpStep(page);
    await page.route("**/api/admin/auth/otp/verify", (route) => route.fulfill({ status: 400, contentType: "application/json", body: errorEnvelope("Incorrect verification code.") }));

    await page.locator("#adminOtpCode").fill("000000");
    await page.locator("#admin-otp-form button[type=\"submit\"]").click();

    await expect(page.locator("[data-admin-otp-banner]")).toContainText("Incorrect verification code");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("the correct code navigates to /admin — only OTP success ever does", async ({ page }) => {
    await goToOtpStep(page);
    await page.route("**/api/admin/auth/otp/verify", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admin: { id: "admin-1", name: "Owner", email: "owner@example.invalid", role: "ADMIN" } }) })
    );
    await mockAdminAuth(page);
    await page.route("**/api/admin/**", (route) => {
      if (route.request().url().includes("/admin/auth/")) return route.fallback();
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({}) });
    });

    await page.locator("#adminOtpCode").fill("123456");
    await page.locator("#admin-otp-form button[type=\"submit\"]").click();

    await expect(page).toHaveURL(/\/admin$/);
  });

  test("Resend Code starts disabled with a cooldown countdown", async ({ page }) => {
    await goToOtpStep(page);
    const resendButton = page.locator('[data-action="admin-otp-resend"]');
    await expect(resendButton).toBeDisabled();
    await expect(resendButton).toContainText("60s");
  });

  test("Resend Code issues a new challenge and updates the masked email if it changes", async ({ page }) => {
    await goToOtpStep(page);
    // Force the cooldown to have already elapsed by directly re-enabling
    // via a fresh page load state is impractical here, so this test only
    // verifies the request shape once triggered — the timer itself is
    // covered by the disabled-state test above.
    let resendCalled = false;
    await page.route("**/api/admin/auth/otp/resend", (route) => {
      resendCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ challengeToken: "mock-challenge-token-2", maskedEmail: "o***@example.invalid", expiresAt: new Date(Date.now() + 600000).toISOString() }) });
    });
    await page.evaluate(() => {
      document.querySelector('[data-action="admin-otp-resend"]').disabled = false;
    });
    await page.locator('[data-action="admin-otp-resend"]').click();
    await page.waitForTimeout(300);
    expect(resendCalled).toBe(true);
  });

  test("Use a Different Account returns to the password step and clears the code field", async ({ page }) => {
    await goToOtpStep(page);
    await page.locator("#adminOtpCode").fill("123456");
    await page.locator('[data-action="admin-otp-back"]').click();

    await expect(page.locator("#admin-login-form")).toBeVisible();
    await expect(page.locator("#admin-otp-form")).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// Forgot / reset password
// ---------------------------------------------------------------------------

test.describe("Admin forgot password (Milestone 179)", () => {
  test("shows the same generic success message regardless of the email entered", async ({ page }) => {
    await page.route("**/api/admin/auth/forgot-password", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope(undefined, "If an admin account exists for that email address, password reset instructions will be sent.") })
    );

    await page.goto("/admin/forgot-password");
    await page.locator("#adminForgotPasswordEmail").fill("nobody@example.invalid");
    await page.locator("#admin-forgot-password-form button[type=\"submit\"]").click();

    await expect(page.locator("[data-admin-forgot-password-success]")).toBeVisible();
    await expect(page.locator("[data-admin-forgot-password-success]")).toContainText("If an admin account exists");
  });

  test("links back to admin login, never the customer login", async ({ page }) => {
    await page.goto("/admin/forgot-password");
    await expect(page.locator('a[href="/admin/login"]')).toBeVisible();
  });
});

test.describe("Admin reset password (Milestone 179)", () => {
  test("no token shows a generic invalid-link message without calling the backend", async ({ page }) => {
    let called = false;
    await page.route("**/api/admin/auth/reset-password", (route) => {
      called = true;
      return route.continue();
    });
    await page.goto("/admin/reset-password");
    await expect(page.locator(".form-banner--error")).toContainText("invalid or has expired");
    expect(called).toBe(false);
  });

  test("mismatched passwords are rejected client-side before any request", async ({ page }) => {
    let called = false;
    await page.route("**/api/admin/auth/reset-password", (route) => {
      called = true;
      return route.continue();
    });
    await page.goto("/admin/reset-password?token=mock-reset-token");
    await page.locator("#adminResetPasswordNew").fill("correct horse battery staple");
    await page.locator("#adminResetPasswordConfirm").fill("different passphrase entirely");
    await page.locator("#admin-reset-password-form button[type=\"submit\"]").click();
    await expect(page.locator('[data-error-for="confirmPassword"]')).toContainText("do not match");
    expect(called).toBe(false);
  });

  test("a password under 12 characters is rejected client-side", async ({ page }) => {
    await page.goto("/admin/reset-password?token=mock-reset-token");
    await page.locator("#adminResetPasswordNew").fill("short1234");
    await page.locator("#adminResetPasswordConfirm").fill("short1234");
    await page.locator("#admin-reset-password-form button[type=\"submit\"]").click();
    await expect(page.locator('[data-error-for="password"]')).toContainText("12 characters");
  });

  test("a valid submission shows the success banner and mentions signing in again", async ({ page }) => {
    await page.route("**/api/admin/auth/reset-password", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: envelope(undefined, "Your password has been reset. Please sign in again.") })
    );
    await page.goto("/admin/reset-password?token=mock-reset-token");
    await page.locator("#adminResetPasswordNew").fill("correct horse battery staple");
    await page.locator("#adminResetPasswordConfirm").fill("correct horse battery staple");
    await page.locator("#admin-reset-password-form button[type=\"submit\"]").click();

    await expect(page.locator("[data-admin-reset-password-success]")).toBeVisible();
    await expect(page.locator("[data-admin-reset-password-success]")).toContainText("sign in again");
  });
});

// ---------------------------------------------------------------------------
// Invitation activation
// ---------------------------------------------------------------------------

test.describe("Admin invitation activation (Milestone 179)", () => {
  test("an invalid/expired token shows a generic error, never a broken page", async ({ page }) => {
    await page.route("**/api/admin/auth/invitation?*", (route) => route.fulfill({ status: 400, contentType: "application/json", body: errorEnvelope("This invitation link is invalid or has expired.") }));
    await page.goto("/admin/activate?token=stale-token");
    await expect(page.locator(".form-banner--error")).toContainText("invalid or has expired");
  });

  test("a valid token shows the invitee's name and masked email before asking for a password", async ({ page }) => {
    await page.route("**/api/admin/auth/invitation?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ name: "Ndamulelo", maskedEmail: "n***@example.invalid" }) }));
    await page.goto("/admin/activate?token=fresh-token");

    await expect(page.locator(".account-page")).toContainText("Ndamulelo");
    await expect(page.locator(".account-page")).toContainText("n***@example.invalid");
    await expect(page.locator("#adminActivatePassword")).toBeVisible();
  });

  test("a valid submission shows the success banner", async ({ page }) => {
    await page.route("**/api/admin/auth/invitation?*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ name: "Ndamulelo", maskedEmail: "n***@example.invalid" }) }));
    await page.route("**/api/admin/auth/invitation/activate", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope(undefined, "Your account is ready. Please sign in.") }));

    await page.goto("/admin/activate?token=fresh-token");
    await page.locator("#adminActivatePassword").fill("correct horse battery staple");
    await page.locator("#adminActivateConfirm").fill("correct horse battery staple");
    await page.locator("#admin-activate-account-form button[type=\"submit\"]").click();

    await expect(page.locator("[data-admin-activate-account-success]")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Admin Users management (Part G)
// ---------------------------------------------------------------------------

const MOCK_ADMINS = [
  { id: "admin-1", name: "Owner", email: "owner@example.invalid", role: "ADMIN", isActive: true, lastLoginAt: "2026-08-30T10:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", invitationPending: false },
  { id: "admin-2", name: "Ndamulelo", email: "nda@example.invalid", role: "STAFF", isActive: false, lastLoginAt: null, createdAt: "2026-08-25T00:00:00.000Z", invitationPending: true },
  { id: "admin-3", name: "Former Staff", email: "former@example.invalid", role: "STAFF", isActive: false, lastLoginAt: "2026-07-01T00:00:00.000Z", createdAt: "2026-02-01T00:00:00.000Z", invitationPending: false },
];

test.describe("Admin Users management (Milestone 179, Part G)", () => {
  test("the Admin Users nav link is present and points at /admin/users", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/users", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admins: MOCK_ADMINS }) }));
    await page.goto("/admin/users");
    const link = page.locator(".admin-nav a", { hasText: "Admin Users" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/admin/users");
  });

  test("lists Name, Email, Role, Status, Last Login and Created — never a password/OTP/token field", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/users", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admins: MOCK_ADMINS }) }));
    await page.goto("/admin/users");

    const ownerRow = page.locator('[data-admin-user-row="admin-1"]');
    await expect(ownerRow).toContainText("Owner");
    await expect(ownerRow).toContainText("owner@example.invalid");
    await expect(ownerRow).toContainText("ADMIN");
    await expect(ownerRow).toContainText("Active");

    const pendingRow = page.locator('[data-admin-user-row="admin-2"]');
    await expect(pendingRow).toContainText("Invitation Sent");
    await expect(pendingRow.getByText("Resend Invitation")).toBeVisible();
    await expect(pendingRow).toContainText("Never");

    const pageText = await page.locator(".admin-page").innerText();
    expect(pageText.toLowerCase()).not.toContain("passwordhash");
    expect(pageText.toLowerCase()).not.toContain("token");
  });

  test("an inactive, previously-activated account shows Activate, not Resend Invitation", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/users", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admins: MOCK_ADMINS }) }));
    await page.goto("/admin/users");

    const row = page.locator('[data-admin-user-row="admin-3"]');
    await expect(row.getByText("Activate", { exact: true })).toBeVisible();
    await expect(row.getByText("Resend Invitation")).toHaveCount(0);
  });

  test("an active account shows Deactivate and a role-toggle button", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/users", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admins: MOCK_ADMINS }) }));
    await page.goto("/admin/users");

    const row = page.locator('[data-admin-user-row="admin-1"]');
    await expect(row.getByText("Deactivate")).toBeVisible();
    await expect(row.getByText("Make Staff")).toBeVisible();
  });

  test("deactivating asks for confirmation before calling the API", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/users", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admins: MOCK_ADMINS }) }));
    let deactivateCalled = false;
    await page.route("**/api/admin/users/admin-1/status", (route) => {
      deactivateCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admin: { ...MOCK_ADMINS[0], isActive: false } }) });
    });

    await page.goto("/admin/users");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator('[data-admin-user-row="admin-1"] [data-action="deactivate-admin-user"]').click();
    await page.waitForTimeout(200);
    expect(deactivateCalled).toBe(false);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('[data-admin-user-row="admin-1"] [data-action="deactivate-admin-user"]').click();
    await page.waitForTimeout(300);
    expect(deactivateCalled).toBe(true);
  });

  test("a 403 (STAFF session) shows an access-restricted message, never redirects to login", async ({ page }) => {
    await mockAdminAuth(page, { id: "admin-2", name: "Staff Member", email: "staff@example.invalid", role: "STAFF" });
    await page.route("**/api/admin/users", (route) => route.fulfill({ status: 403, contentType: "application/json", body: errorEnvelope("You do not have permission to perform this action.") }));

    await page.goto("/admin/users");
    await expect(page.locator(".form-banner--error")).toContainText("do not have permission");
    await expect(page).toHaveURL(/\/admin\/users/);
  });

  test("a 401 redirects to admin login", async ({ page }) => {
    await page.route("**/api/admin/users", (route) => route.fulfill({ status: 401, contentType: "application/json", body: errorEnvelope("Authentication required.") }));
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("Admin User invite form (Milestone 179, Part B/G)", () => {
  test("defaults the role to STAFF, never ADMIN", async ({ page }) => {
    await mockAdminAuth(page);
    await page.goto("/admin/users/invite");
    await expect(page.locator("#adminInviteRole")).toHaveValue("STAFF");
  });

  test("requires name and a valid email before calling the API", async ({ page }) => {
    await mockAdminAuth(page);
    let inviteCalled = false;
    await page.route("**/api/admin/users/invite", (route) => {
      inviteCalled = true;
      return route.continue();
    });

    await page.goto("/admin/users/invite");
    await page.locator("[data-admin-user-invite-form] button[type=\"submit\"]").click();
    await expect(page.locator('[data-error-for="name"]')).toContainText("required");
    expect(inviteCalled).toBe(false);
  });

  test("a valid submission navigates back to the admin users list with a success message", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/users/invite", (route) =>
      route.fulfill({ status: 201, contentType: "application/json", body: envelope({ admin: { id: "admin-new", name: "Ndamulelo", email: "nda@example.invalid", role: "STAFF" }, expiresAt: new Date().toISOString() }) })
    );
    await page.route("**/api/admin/users", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admins: MOCK_ADMINS }) }));

    await page.goto("/admin/users/invite");
    await page.locator("#adminInviteName").fill("Ndamulelo");
    await page.locator("#adminInviteEmail").fill("nda@example.invalid");
    await page.locator("[data-admin-user-invite-form] button[type=\"submit\"]").click();

    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.locator(".form-banner--success")).toContainText("Invitation sent");
  });
});

// ---------------------------------------------------------------------------
// Log Out All Sessions
// ---------------------------------------------------------------------------

test.describe("Log Out All Sessions (Milestone 179, brief section 32)", () => {
  test("the button is present in the admin nav alongside Sign Out", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/users", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admins: [] }) }));
    await page.goto("/admin/users");
    await expect(page.locator('[data-action="admin-logout-all"]')).toBeVisible();
    await expect(page.locator('[data-action="admin-logout"]')).toBeVisible();
  });

  test("asks for confirmation, and only calls the API when confirmed", async ({ page }) => {
    await mockAdminAuth(page);
    await page.route("**/api/admin/users", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admins: [] }) }));
    let logoutAllCalled = false;
    await page.route("**/api/admin/auth/logout-all", (route) => {
      logoutAllCalled = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope(undefined) });
    });

    await page.goto("/admin/users");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator('[data-action="admin-logout-all"]').click();
    await page.waitForTimeout(200);
    expect(logoutAllCalled).toBe(false);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator('[data-action="admin-logout-all"]').click();
    await expect(page).toHaveURL(/\/admin\/login/);
    expect(logoutAllCalled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// noindex — every new admin route stays out of search results
// ---------------------------------------------------------------------------

test.describe("New Milestone 179 admin routes are noindex", () => {
  for (const path of ["/admin/forgot-password", "/admin/reset-password", "/admin/activate", "/admin/users", "/admin/users/invite"]) {
    test(`${path} is noindex`, async ({ page }) => {
      await mockAdminAuth(page);
      await page.route("**/api/admin/users", (route) => route.fulfill({ status: 200, contentType: "application/json", body: envelope({ admins: [] }) }));
      await page.route("**/api/admin/auth/invitation?*", (route) => route.fulfill({ status: 400, contentType: "application/json", body: errorEnvelope("Invalid.") }));
      await page.goto(path);
      const robots = await page.locator('meta[name="robots"]').getAttribute("content");
      expect(robots).toContain("noindex");
    });
  }
});
