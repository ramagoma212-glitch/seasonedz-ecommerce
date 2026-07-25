// Forgot password page (Version 7, Milestone 132) — /account/forgot-password.
// Always shows the same generic success message after submit, whatever
// the entered email was — the backend (POST /api/customers/forgot-password)
// already guarantees an identical response for every case (unknown
// email, inactive account, or a genuine match), so this page never
// tries to be "smarter" than that response.

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

export async function renderForgotPassword() {
  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Forgot Password</h1>
      <p class="stub-page__text">Enter the email address for your account and we'll send you a link to reset your password.</p>

      <form id="customer-forgot-password-form" class="checkout-form account-form" novalidate>
        ${renderField({ id: "forgotPasswordEmail", name: "email", label: "Email", type: "email", autocomplete: "email" })}

        <div class="form-banner form-banner--error" data-customer-forgot-password-banner hidden></div>

        <button type="submit" class="btn btn--primary btn--block">Send Reset Link</button>
      </form>

      <div class="form-banner form-banner--success" data-customer-forgot-password-success hidden>
        If an account exists for that email, a reset link has been sent.
      </div>

      <p class="account-form__note"><a href="/account">Back to Log In</a></p>
    </section>
  `;
}
