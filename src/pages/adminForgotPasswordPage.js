// Milestone 179, Part D: admin forgotten password — /admin/forgot-password.
// Deliberately its own page/route, never the customer forgotPasswordPage.js
// (brief: "never send an admin through the customer login system").
// Always shows the same generic success message after submit, whatever
// the entered email was — the backend (POST /api/admin/auth/forgot-password)
// already guarantees an identical response for every case.

function renderField({ id, name, label, type = "text", autocomplete = "" }) {
  return `
    <div class="form-field">
      <label class="form-field__label" for="${id}">
        ${label}
        <span class="form-field__required" aria-hidden="true">*</span>
      </label>
      <input
        type="${type}"
        id="${id}"
        name="${name}"
        class="form-field__input"
        required
        ${autocomplete ? `autocomplete="${autocomplete}"` : ""}
      />
      <span class="form-field__error" data-error-for="${name}"></span>
    </div>
  `;
}

export async function renderAdminForgotPassword() {
  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Admin Forgot Password</h1>
      <p class="stub-page__text">Enter the email address for your Seasonedz Admin account and we'll send you a link to reset your password.</p>

      <form id="admin-forgot-password-form" class="checkout-form account-form" novalidate>
        ${renderField({ id: "adminForgotPasswordEmail", name: "email", label: "Email", type: "email", autocomplete: "username" })}

        <div class="form-banner form-banner--error" data-admin-forgot-password-banner hidden></div>

        <button type="submit" class="btn btn--primary btn--block">Send Reset Link</button>
      </form>

      <div class="form-banner form-banner--success" data-admin-forgot-password-success hidden>
        If an admin account exists for that email address, password reset instructions will be sent.
      </div>

      <p class="account-form__note"><a href="/admin/login">Back to Admin Login</a></p>
    </section>
  `;
}
