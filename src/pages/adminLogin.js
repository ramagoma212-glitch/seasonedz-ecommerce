// Admin login page (Version 7, Milestone 58 — foundation only).
// A single email/password form — no order, enquiry, customer or
// product data is shown here or reachable from here. Submission is
// handled by the delegated #admin-login-form handler in js/app.js
// (see setupAdminLoginForm), which calls js/api/adminAuthApi.js and
// redirects to #/admin on success.
//
// This page is not linked from any customer-facing navigation — see
// VERSION_7_ADMIN_AUTH_FOUNDATION_RESULT.md's "Navigation Safety"
// section for why that's a deliberate choice, not an oversight.

export function renderAdminLogin() {
  return `
    <section class="stub-page container admin-login-page">
      <h1 class="stub-page__title">Admin Login</h1>
      <p class="stub-page__text">Sign in to access the Seasonedz Group admin area.</p>

      <form id="admin-login-form" class="checkout-form admin-login-form" novalidate>
        <div class="form-field">
          <label class="form-field__label" for="adminEmail">
            Email<span class="form-field__required" aria-hidden="true"> *</span>
          </label>
          <input type="email" id="adminEmail" name="email" class="form-field__input" required autocomplete="username" />
          <span class="form-field__error" data-error-for="email"></span>
        </div>

        <div class="form-field">
          <label class="form-field__label" for="adminPassword">
            Password<span class="form-field__required" aria-hidden="true"> *</span>
          </label>
          <input
            type="password"
            id="adminPassword"
            name="password"
            class="form-field__input"
            required
            autocomplete="current-password"
          />
          <span class="form-field__error" data-error-for="password"></span>
        </div>

        <div class="form-banner form-banner--error" data-admin-login-banner hidden></div>

        <button type="submit" class="btn btn--primary btn--block">Sign In</button>
      </form>
    </section>
  `;
}
