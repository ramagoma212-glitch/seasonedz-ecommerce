// Admin login page (Version 7, Milestone 58 — foundation only).
//
// Milestone 179: reworked into two steps — email/password, then an
// email OTP code — matching the backend's own two-step flow (brief
// Part C: "do NOT create the authenticated admin session before OTP
// succeeds"). Both steps live in this one page's markup from the
// start (the OTP section starts hidden); js/app.js's submit handlers
// toggle between them by hiding/showing, exactly like the existing
// success-banner toggle pattern on forgotPasswordPage.js — no extra
// route or page reload for the second step. Neither step reveals
// whether an email exists (generic errors throughout) or which of
// password/OTP was wrong.
//
// This page is not linked from any customer-facing navigation — see
// VERSION_7_ADMIN_AUTH_FOUNDATION_RESULT.md's "Navigation Safety"
// section for why that's a deliberate choice, not an oversight.

import { renderPasswordToggleButton } from "../js/passwordToggle.js";
import { consumePendingAdminMessage } from "../js/adminGuard.js";
import { escapeHtml } from "../js/search.js";

export function renderAdminLogin() {
  const pendingMessage = consumePendingAdminMessage();

  return `
    <section class="stub-page container admin-login-page">
      <h1 class="stub-page__title">Admin Login</h1>
      <p class="stub-page__text">Sign in to access the Seasonedz Group admin area.</p>

      ${pendingMessage ? `<div class="form-banner form-banner--success">${escapeHtml(pendingMessage)}</div>` : ""}

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
          <div class="form-field__input-wrap">
            <input
              type="password"
              id="adminPassword"
              name="password"
              class="form-field__input"
              required
              autocomplete="current-password"
            />
            ${renderPasswordToggleButton("adminPassword")}
          </div>
          <span class="form-field__error" data-error-for="password"></span>
        </div>

        <div class="form-banner form-banner--error" data-admin-login-banner hidden></div>

        <button type="submit" class="btn btn--primary btn--block">Sign In</button>
        <p class="account-form__note"><a href="/admin/forgot-password">Forgot Password?</a></p>
      </form>

      <form id="admin-otp-form" class="checkout-form admin-login-form" novalidate hidden data-challenge-token="">
        <p class="stub-page__text" data-admin-otp-description>A verification code has been sent to your email.</p>

        <div class="form-field">
          <label class="form-field__label" for="adminOtpCode">
            Verification Code<span class="form-field__required" aria-hidden="true"> *</span>
          </label>
          <input
            type="text"
            id="adminOtpCode"
            name="code"
            class="form-field__input"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            required
          />
          <span class="form-field__error" data-error-for="code"></span>
        </div>

        <div class="form-banner form-banner--error" data-admin-otp-banner hidden></div>

        <button type="submit" class="btn btn--primary btn--block">Verify</button>
        <div class="admin-otp-actions">
          <button type="button" class="btn btn--secondary btn--sm" data-action="admin-otp-resend">Resend Code</button>
          <button type="button" class="btn btn--secondary btn--sm" data-action="admin-otp-back">Use a Different Account</button>
        </div>
      </form>
    </section>
  `;
}
