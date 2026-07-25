// Customer account page (Version 7, Milestone 128) — /account. Shows a
// login/register toggle when logged out, or a simple account overview
// when logged in. Reads real state from the backend
// (GET /api/customers/me, via js/api/customerApi.js) on every render —
// never assumes logged-in/out from anything client-stored, since the
// only thing proving a session is valid is the HttpOnly customer_session
// cookie itself, which this page never reads directly.
//
// Deliberately no order history yet (see js/app.js's own comment on
// setupCustomerAccountForms) — the logged-in view says so plainly
// rather than showing an empty/broken section.

import { getCurrentCustomer } from "../js/api/customerApi.js";
import { ApiError } from "../js/apiClient.js";
import { escapeHtml } from "../js/search.js";

// `id` is the unique DOM id (this page renders login and register
// forms at once, so field ids are prefixed per form to stay unique);
// `name` is the logical field name used both as the input's `name`
// attribute and as `data-error-for` — matching the keys
// validateCustomerRegisterForm()/validateCustomerLoginForm() return,
// so showAccountFormErrors() (js/app.js) can actually find the right
// error slot for each field.
function renderField({ id, name, label, type = "text", required = true, autocomplete = "" }) {
  return `
    <div class="form-field">
      <label class="form-field__label" for="${id}">
        ${label}
        ${required ? '<span class="form-field__required" aria-hidden="true">*</span>' : '<span class="form-field__optional">(optional)</span>'}
      </label>
      <input
        type="${type}"
        id="${id}"
        name="${name}"
        class="form-field__input"
        ${required ? "required" : ""}
        ${autocomplete ? `autocomplete="${autocomplete}"` : ""}
      />
      <span class="form-field__error" data-error-for="${name}"></span>
    </div>
  `;
}

function renderLoginForm() {
  return `
    <form id="customer-login-form" class="checkout-form account-form" novalidate>
      ${renderField({ id: "loginEmail", name: "email", label: "Email", type: "email", autocomplete: "username" })}
      ${renderField({ id: "loginPassword", name: "password", label: "Password", type: "password", autocomplete: "current-password" })}

      <div class="form-banner form-banner--error" data-customer-login-banner hidden></div>

      <button type="submit" class="btn btn--primary btn--block">Log In</button>
      <p class="account-form__note">Forgot password support will be added soon.</p>
    </form>
  `;
}

function renderRegisterForm() {
  return `
    <form id="customer-register-form" class="checkout-form account-form" novalidate>
      ${renderField({ id: "registerFirstName", name: "firstName", label: "First Name", autocomplete: "given-name" })}
      ${renderField({ id: "registerLastName", name: "lastName", label: "Last Name", autocomplete: "family-name" })}
      ${renderField({ id: "registerEmail", name: "email", label: "Email", type: "email", autocomplete: "email" })}
      ${renderField({ id: "registerPhone", name: "phone", label: "Phone Number", type: "tel", required: false, autocomplete: "tel" })}
      ${renderField({ id: "registerPassword", name: "password", label: "Password", type: "password", autocomplete: "new-password" })}
      ${renderField({ id: "registerConfirmPassword", name: "confirmPassword", label: "Confirm Password", type: "password", autocomplete: "new-password" })}

      <div class="form-banner form-banner--error" data-customer-register-banner hidden></div>

      <button type="submit" class="btn btn--primary btn--block">Create Account</button>
    </form>
  `;
}

function renderLoggedOutView() {
  return `
    <section class="container account-page">
      <h1 class="stub-page__title">My Account</h1>
      <p class="stub-page__text">Log in to your Seasonedz Group account, or create a new one — you can always check out as a guest instead.</p>

      <div class="account-auth-toggle" role="tablist" aria-label="Account access">
        <button type="button" class="account-auth-toggle__btn is-active" data-account-tab="login" role="tab" aria-selected="true">Log In</button>
        <button type="button" class="account-auth-toggle__btn" data-account-tab="register" role="tab" aria-selected="false">Create Account</button>
      </div>

      <div data-account-panel="login">${renderLoginForm()}</div>
      <div data-account-panel="register" hidden>${renderRegisterForm()}</div>
    </section>
  `;
}

function renderLoggedInView(customer) {
  return `
    <section class="container account-page">
      <h1 class="stub-page__title">My Account</h1>

      <div class="order-confirmation__card account-overview">
        <h3>Welcome, ${escapeHtml(customer.firstName)}</h3>
        <div class="order-confirmation__row"><span>Email</span><span>${escapeHtml(customer.email)}</span></div>
        ${customer.phone ? `<div class="order-confirmation__row"><span>Phone</span><span>${escapeHtml(customer.phone)}</span></div>` : ""}
        <div class="order-confirmation__row"><span>Account Status</span><span class="badge">Active</span></div>
      </div>

      <div class="demo-notice">
        <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
        <div>
          <strong>My Orders will be available soon.</strong>
          <p>You can still track any order using its order number on our <a href="/track-order">Track Order</a> page.</p>
        </div>
      </div>

      <button type="button" id="customer-logout-button" class="btn btn--secondary">Logout</button>
    </section>
  `;
}

export async function renderAccount() {
  try {
    const response = await getCurrentCustomer();
    return renderLoggedInView(response.data.customer);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return renderLoggedOutView();
    }
    // Any other failure (network down, unexpected error) — safest
    // fallback is the logged-out view rather than a broken page; the
    // login/register forms themselves handle a backend-unavailable
    // error clearly if the visitor then tries to submit one.
    return renderLoggedOutView();
  }
}
