// Reset password page (Version 7, Milestone 132) — /account/reset-password.
// Reads the reset token from the query string only (?token=...), never
// from a route param — router.js passes the parsed URLSearchParams
// through as `query` on every render() call (see router.js's own
// comment on this). A missing token shows a safe, generic invalid-link
// message immediately, without ever calling the backend — this never
// reveals whether a token would have been valid, matching the same
// no-enumeration discipline the backend itself applies.

import { escapeHtml } from "../js/search.js";
import { renderPasswordToggleButton } from "../js/passwordToggle.js";

function renderField({ id, name, label, type = "password", autocomplete = "" }) {
  const isPassword = type === "password";
  const input = `
      <input
        type="${type}"
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
      ${isPassword ? `<div class="form-field__input-wrap">${input}${renderPasswordToggleButton(id)}</div>` : input}
      <span class="form-field__error" data-error-for="${name}"></span>
    </div>
  `;
}

function renderInvalidLink() {
  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Reset Password</h1>
      <div class="form-banner form-banner--error">This reset link is invalid or has expired.</div>
      <p class="account-form__note"><a href="/account/forgot-password">Request a new reset link</a></p>
    </section>
  `;
}

export async function renderResetPassword({ query } = {}) {
  const token = query?.get("token") || "";
  if (!token) return renderInvalidLink();

  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Reset Password</h1>

      <form id="customer-reset-password-form" class="checkout-form account-form" novalidate data-reset-token="${escapeHtml(token)}">
        ${renderField({ id: "resetPasswordNew", name: "password", label: "New Password", autocomplete: "new-password" })}
        ${renderField({ id: "resetPasswordConfirm", name: "confirmPassword", label: "Confirm New Password", autocomplete: "new-password" })}

        <div class="form-banner form-banner--error" data-customer-reset-password-banner hidden></div>

        <button type="submit" class="btn btn--primary btn--block">Reset Password</button>
      </form>

      <div class="form-banner form-banner--success" data-customer-reset-password-success hidden>
        Your password has been reset. You can now <a href="/account">log in</a>.
      </div>
    </section>
  `;
}
