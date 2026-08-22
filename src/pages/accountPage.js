// Customer account page (Version 7, Milestone 128) — /account. Shows a
// login/register toggle when logged out, or a simple account overview
// when logged in. Reads real state from the backend
// (GET /api/customers/me, via js/api/customerApi.js) on every render —
// never assumes logged-in/out from anything client-stored, since the
// only thing proving a session is valid is the HttpOnly customer_session
// cookie itself, which this page never reads directly.
//
// Version 7, Milestone 130: My Orders now shows real orders linked to
// this account (GET /api/customers/orders) — only orders placed while
// signed in ever appear here (Order.customerId set at checkout time,
// see backend/src/services/order.service.ts). Guest orders are never
// matched by email; a customer looking for one is pointed at the
// existing public /track-order page instead.

import { getCurrentCustomer, getCustomerOrders } from "../js/api/customerApi.js";
import { getAuthProviders, getConnectedAccounts, getOAuthStartUrl } from "../js/api/socialAuthApi.js";
import { renderSocialAuthButtons, SOCIAL_AUTH_PROVIDER_LABELS } from "../components/socialAuthButtons.js";
import { ApiError } from "../js/apiClient.js";
import { escapeHtml } from "../js/search.js";

// Version 7, Milestone 171F: friendly messages for every ?authError=
// code socialAuth.controller.ts's redirectToAccountWithError() can
// send — never a raw stack trace or backend error string, matching the
// milestone brief's "ERROR UX" requirement.
const AUTH_ERROR_MESSAGES = {
  cancelled: "Sign-in was cancelled.",
  state_invalid: "Your sign-in attempt could not be verified. Please try again.",
  state_expired: "Your sign-in attempt expired. Please try again.",
  generic: "We couldn't complete that sign-in. Please try again.",
  account_disabled: "This account has been disabled. Contact support for help.",
  account_exists: "An account already exists with this email. Sign in with your existing method first to securely connect it.",
  email_required: "We couldn't get an email address from that provider. Please allow email access and try again, or sign in a different way.",
  provider_linked_elsewhere: "That account is already connected to a different Seasonedz account.",
  last_login_method: "You can't disconnect your only sign-in method. Set a password or connect another provider first.",
  link_session_expired: "Your session expired before the connection could finish. Please sign in and try again.",
};

function renderAuthErrorBanner() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("authError");
  if (!code) return "";
  const message = AUTH_ERROR_MESSAGES[code] || AUTH_ERROR_MESSAGES.generic;
  return `<div class="form-banner form-banner--error social-auth-error">${escapeHtml(message)}</div>`;
}

function renderLinkedBanner() {
  const params = new URLSearchParams(window.location.search);
  const provider = params.get("linked");
  if (!provider || !SOCIAL_AUTH_PROVIDER_LABELS[provider]) return "";
  return `<div class="form-banner form-banner--success social-auth-error">${escapeHtml(SOCIAL_AUTH_PROVIDER_LABELS[provider])} connected successfully.</div>`;
}

function humanizeEnum(value) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
}

function formatRand(amount) {
  return `R${Number(amount).toFixed(2)}`;
}

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
      <p class="account-form__note"><a href="/account/forgot-password">Forgot password?</a></p>
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

// Version 7, Milestone 171F: best-effort — a failed/unreachable
// providers fetch just means no social buttons render this load
// (identical to every provider being disabled), never a broken page;
// email/password sign-in is completely unaffected either way.
async function fetchAuthProviders() {
  try {
    const response = await getAuthProviders();
    return response?.data || { google: false, facebook: false, apple: false };
  } catch {
    return { google: false, facebook: false, apple: false };
  }
}

async function renderLoggedOutView() {
  const providers = await fetchAuthProviders();
  const socialButtons = renderSocialAuthButtons(providers, { intent: "login" });

  return `
    <section class="container account-page">
      <h1 class="stub-page__title">My Account</h1>
      <p class="stub-page__text">Log in to your Seasonedz Group account, or create a new one. You can always check out as a guest instead.</p>

      ${renderAuthErrorBanner()}

      <div class="account-auth-toggle" role="tablist" aria-label="Account access">
        <button type="button" class="account-auth-toggle__btn is-active" data-account-tab="login" role="tab" aria-selected="true">Log In</button>
        <button type="button" class="account-auth-toggle__btn" data-account-tab="register" role="tab" aria-selected="false">Create Account</button>
      </div>

      <div data-account-panel="login">${socialButtons}${renderLoginForm()}</div>
      <div data-account-panel="register" hidden>${socialButtons}${renderRegisterForm()}</div>
    </section>
  `;
}

function renderOrderCard(order) {
  return `
    <div class="order-confirmation__card account-order-card">
      <div class="account-order-card__header">
        <div>
          <p class="tracking-result__label">Order Number</p>
          <h3>${escapeHtml(order.orderNumber)}</h3>
        </div>
        <span class="badge">${humanizeEnum(order.status)}</span>
      </div>
      <div class="order-confirmation__row"><span>Date</span><span>${formatDate(order.createdAt)}</span></div>
      <div class="order-confirmation__row"><span>Payment Status</span><span class="badge">${humanizeEnum(order.paymentStatus)}</span></div>
      <div class="order-confirmation__row"><span>Total</span><span>${formatRand(order.total)}</span></div>
      <div class="order-confirmation__actions">
        <a class="btn btn--secondary" href="/account/orders/${encodeURIComponent(order.orderNumber)}">View Details</a>
      </div>
    </div>
  `;
}

function renderOrdersEmptyState() {
  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>You do not have any account orders yet.</strong>
        <p>Orders placed while signed in will appear here.</p>
        <p>Looking for a guest order? Use <a href="/track-order">Track Order</a>.</p>
      </div>
    </div>
  `;
}

// Best-effort: an order-history fetch failure never breaks the whole
// account page — it just shows the same empty state a genuinely
// order-free account would, since there's nothing actionable a
// customer can do about a transient backend error here beyond what a
// reload already offers.
async function renderMyOrdersSection() {
  let orders = [];
  try {
    const response = await getCustomerOrders();
    orders = response?.data?.orders || [];
  } catch {
    orders = [];
  }

  return `
    <div class="account-orders">
      <h2 class="checkout-section__label">My Orders</h2>
      ${orders.length ? `<div class="account-orders__list">${orders.map(renderOrderCard).join("")}</div>` : renderOrdersEmptyState()}
    </div>
  `;
}

// Version 7, Milestone 171F: only ever shows a Connect action for a
// provider GET /api/auth/providers reports as actually usable right
// now — never a button that would just 503 (see socialAuthButtons.js's
// own reasoning for the login panels, same rule applies here). A
// provider that's connected is always shown as "Connected" regardless
// of its current *_AUTH_ENABLED state, since disconnecting must remain
// possible even if the provider is later turned off.
async function renderConnectedAccountsSection() {
  let providers = { google: false, facebook: false, apple: false };
  let connected = new Set();

  try {
    const [providersResponse, connectedResponse] = await Promise.all([getAuthProviders(), getConnectedAccounts()]);
    providers = providersResponse?.data || providers;
    connected = new Set(
      (connectedResponse?.data?.providers || []).filter((entry) => entry.connected).map((entry) => entry.provider.toLowerCase())
    );
  } catch {
    // Best-effort — see renderMyOrdersSection()'s own comment. The rest
    // of the account page (orders, logout) is completely unaffected.
    return "";
  }

  const rows = Object.keys(SOCIAL_AUTH_PROVIDER_LABELS)
    .filter((key) => providers[key] || connected.has(key))
    .map((key) => {
      const label = SOCIAL_AUTH_PROVIDER_LABELS[key];
      const isConnected = connected.has(key);
      const action = isConnected
        ? `<button type="button" class="btn btn--sm btn--secondary" data-action="disconnect-provider" data-provider="${key}">Disconnect</button>`
        : providers[key]
          ? `<a class="btn btn--sm btn--social" href="${getOAuthStartUrl(key, { intent: "link" })}" data-social-auth-button="${key}">Connect</a>`
          : "";
      return `
        <div class="connected-accounts__row">
          <span class="connected-accounts__provider">${escapeHtml(label)}</span>
          ${isConnected ? '<span class="badge">Connected</span>' : ""}
          ${action}
        </div>
      `;
    })
    .join("");

  if (!rows) return "";

  return `
    <div class="connected-accounts">
      <h2 class="checkout-section__label">Connected Accounts</h2>
      ${rows}
    </div>
  `;
}

async function renderLoggedInView(customer) {
  return `
    <section class="container account-page">
      <h1 class="stub-page__title">My Account</h1>

      ${renderLinkedBanner()}
      ${renderAuthErrorBanner()}

      <div class="order-confirmation__card account-overview">
        <h3>Welcome, ${escapeHtml(customer.firstName)}</h3>
        <div class="order-confirmation__row"><span>Email</span><span>${escapeHtml(customer.email)}</span></div>
        ${customer.phone ? `<div class="order-confirmation__row"><span>Phone</span><span>${escapeHtml(customer.phone)}</span></div>` : ""}
        <div class="order-confirmation__row"><span>Account Status</span><span class="badge">Active</span></div>
      </div>

      ${await renderConnectedAccountsSection()}

      ${await renderMyOrdersSection()}

      <button type="button" id="customer-logout-button" class="btn btn--secondary">Logout</button>
    </section>
  `;
}

export async function renderAccount() {
  try {
    const response = await getCurrentCustomer();
    return await renderLoggedInView(response.data.customer);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return await renderLoggedOutView();
    }
    // Any other failure (network down, unexpected error) — safest
    // fallback is the logged-out view rather than a broken page; the
    // login/register forms themselves handle a backend-unavailable
    // error clearly if the visitor then tries to submit one.
    return await renderLoggedOutView();
  }
}
