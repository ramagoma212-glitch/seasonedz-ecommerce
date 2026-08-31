// Milestone 179, Part B: admin invitation activation — /admin/activate.
// Reached only via the one-time link an invitation email sends (see
// backend's sendAdminInvitationEmail); never linked from anywhere in
// this app. Shows who the invitation is for (name + masked email, via
// GET /admin/auth/invitation) before asking the invitee to choose their
// own password — this backend never emails or generates one.

import { escapeHtml } from "../js/search.js";
import { renderPasswordToggleButton } from "../js/passwordToggle.js";
import { previewAdminInvitation } from "../js/api/adminAuthApi.js";
import { ApiUnavailableError } from "../js/apiClient.js";

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

function renderInvalidLink(unavailable) {
  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Activate Admin Account</h1>
      <div class="form-banner form-banner--error">
        ${unavailable ? "We could not connect to the admin system right now. Please try again shortly." : "This invitation link is invalid or has expired. Ask an administrator to send you a new one."}
      </div>
    </section>
  `;
}

export async function renderAdminActivateAccount({ query } = {}) {
  const token = query?.get("token") || "";
  if (!token) return renderInvalidLink(false);

  let preview;
  try {
    const response = await previewAdminInvitation(token);
    preview = response.data;
  } catch (error) {
    return renderInvalidLink(error instanceof ApiUnavailableError);
  }

  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Activate Admin Account</h1>
      <p class="stub-page__text">Welcome, ${escapeHtml(preview.name)}. Set a password for ${escapeHtml(preview.maskedEmail)} to activate your Seasonedz Admin account.</p>
      <p class="stub-page__text">Password must be at least 12 characters. A long passphrase is welcome.</p>

      <form id="admin-activate-account-form" class="checkout-form account-form" novalidate data-activation-token="${escapeHtml(token)}">
        ${renderField({ id: "adminActivatePassword", name: "password", label: "Password", autocomplete: "new-password" })}
        ${renderField({ id: "adminActivateConfirm", name: "confirmPassword", label: "Confirm Password", autocomplete: "new-password" })}

        <div class="form-banner form-banner--error" data-admin-activate-account-banner hidden></div>

        <button type="submit" class="btn btn--primary btn--block">Activate Account</button>
      </form>

      <div class="form-banner form-banner--success" data-admin-activate-account-success hidden>
        Your account is ready. <a href="/admin/login">Sign in</a>
      </div>
    </section>
  `;
}
