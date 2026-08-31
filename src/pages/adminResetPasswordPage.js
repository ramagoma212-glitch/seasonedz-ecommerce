// Milestone 179, Part D: admin reset password — /admin/reset-password.
// Deliberately its own page/route, never the customer resetPasswordPage.js.
// Reads the reset token from the query string only (?token=...), never
// a route param — same discipline as the customer page. A missing
// token shows a safe, generic invalid-link message immediately,
// without ever calling the backend.

import { escapeHtml } from "../js/search.js";
import { renderPasswordToggleButton } from "../js/passwordToggle.js";

function renderField({ id, name, label, autocomplete = "" }) {
  const input = `
      <input
        type="password"
        id="${id}"
        name="${name}"
        class="form-field__input"
        required
        ${autocomplete ? `autocomplete="${autocomplete}"` : ""}
      />
  `;
  return `
    <div class="form-field">
      <label class="form-field__label" for="${id}">
        ${label}
        <span class="form-field__required" aria-hidden="true">*</span>
      </label>
      <div class="form-field__input-wrap">${input}${renderPasswordToggleButton(id)}</div>
      <span class="form-field__error" data-error-for="${name}"></span>
    </div>
  `;
}

function renderInvalidLink() {
  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Admin Reset Password</h1>
      <div class="form-banner form-banner--error">This reset link is invalid or has expired.</div>
      <p class="account-form__note"><a href="/admin/forgot-password">Request a new reset link</a></p>
    </section>
  `;
}

export async function renderAdminResetPassword({ query } = {}) {
  const token = query?.get("token") || "";
  if (!token) return renderInvalidLink();

  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Admin Reset Password</h1>
      <p class="stub-page__text">Password must be at least 12 characters. A long passphrase is welcome.</p>

      <form id="admin-reset-password-form" class="checkout-form account-form" novalidate data-reset-token="${escapeHtml(token)}">
        ${renderField({ id: "adminResetPasswordNew", name: "password", label: "New Password", autocomplete: "new-password" })}
        ${renderField({ id: "adminResetPasswordConfirm", name: "confirmPassword", label: "Confirm New Password", autocomplete: "new-password" })}

        <div class="form-banner form-banner--error" data-admin-reset-password-banner hidden></div>

        <button type="submit" class="btn btn--primary btn--block">Reset Password</button>
      </form>

      <div class="form-banner form-banner--success" data-admin-reset-password-success hidden>
        Your password has been reset. You will need to sign in again on every device.
        <a href="/admin/login">Sign in</a>
      </div>
    </section>
  `;
}
