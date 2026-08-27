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

import {
  getCurrentCustomer,
  getCustomerOrders,
  getMyAffiliatePortal,
  getMyNotifications,
  getMyNotificationPreferences,
} from "../js/api/customerApi.js";
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

// Version 7, Milestone 174C: the Customer Notification Centre — brief
// section 16. Deliberately inside /account, no separate bell/route —
// see this milestone's own final report for why the bell (section 20)
// was deferred. Best-effort, same "a fetch failure never breaks the
// whole account page" discipline as My Orders above.
function renderNotificationCard(notification) {
  const unreadClass = notification.readAt ? "" : " account-notification--unread";
  return `
    <div class="order-confirmation__card account-notification${unreadClass}" data-notification-id="${escapeHtml(notification.id)}">
      <div class="account-order-card__header">
        <p>${escapeHtml(notification.subject || humanizeEnum(notification.eventType))}</p>
        ${notification.readAt ? "" : '<span class="badge">New</span>'}
      </div>
      <div class="order-confirmation__row"><span>Date</span><span>${formatDate(notification.createdAt)}</span></div>
      ${notification.readAt ? "" : `<button type="button" class="btn btn--secondary account-notification__action" data-action="mark-notification-read" data-notification-id="${escapeHtml(notification.id)}">Mark as read</button>`}
    </div>
  `;
}

function renderNotificationsEmptyState() {
  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div><strong>No notifications yet.</strong><p>Updates about your orders, delivery and account will appear here.</p></div>
    </div>
  `;
}

async function renderNotificationsSection() {
  let notifications = [];
  let unreadCount = 0;
  try {
    const response = await getMyNotifications(1, 20);
    notifications = response?.data?.notifications || [];
    unreadCount = response?.data?.unreadCount || 0;
  } catch {
    notifications = [];
  }

  return `
    <div class="account-notifications" data-notifications-section>
      <h2 class="checkout-section__label">Notifications${unreadCount > 0 ? ` <span class="badge">${unreadCount} new</span>` : ""}</h2>
      ${unreadCount > 0 ? '<button type="button" class="btn btn--secondary account-notification__action" data-action="mark-all-notifications-read">Mark all as read</button>' : ""}
      ${notifications.length ? `<div class="account-notifications__list">${notifications.map(renderNotificationCard).join("")}</div>` : renderNotificationsEmptyState()}
    </div>
  `;
}

// Version 7, Milestone 174C: engagement preferences — brief section
// 21-22. Essential/transactional notifications have no toggle here at
// all (structurally impossible to opt out of, matching the backend's
// own design) — only the four genuinely optional categories.
const PREFERENCE_FIELDS = [
  { key: "reviewRequestsOptOut", label: "Product review requests" },
  { key: "stockAlertsOptOut", label: "Back-in-stock alerts" },
  { key: "wishlistAlertsOptOut", label: "Wishlist back-in-stock alerts" },
  { key: "abandonedCheckoutOptOut", label: "Abandoned checkout reminders" },
];

async function renderNotificationPreferencesSection() {
  let preferences = { reviewRequestsOptOut: false, stockAlertsOptOut: false, wishlistAlertsOptOut: false, abandonedCheckoutOptOut: false };
  try {
    const response = await getMyNotificationPreferences();
    preferences = response?.data || preferences;
  } catch {
    // Best-effort — the form still renders with safe (opted-in) defaults.
  }

  return `
    <div class="account-preferences">
      <h2 class="checkout-section__label">Notification Preferences</h2>
      <p>Order, payment, delivery and account notifications are always sent — they can't be turned off here. You can opt out of the following:</p>
      <form id="notification-preferences-form" data-notification-preferences-form>
        ${PREFERENCE_FIELDS.map(
          (field) => `
          <label class="account-preferences__field">
            <input type="checkbox" name="${field.key}" ${preferences[field.key] ? "" : "checked"} />
            <span>${escapeHtml(field.label)}</span>
          </label>
        `
        ).join("")}
        <button type="submit" class="btn btn--secondary">Save Preferences</button>
        <p class="form-banner" data-preferences-banner hidden></p>
      </form>
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

// ---------------------------------------------------------------------------
// Affiliate Programme (Version 7, Milestone 172B.6). Reuses this exact
// customer session — there is no second affiliate login anywhere. Every
// figure shown here is whatever the backend's own
// customerAffiliate.service.ts returns for req.customerUser.id; this
// page never computes a rate, balance, or eligibility itself.
// ---------------------------------------------------------------------------

function renderReferralLink(link) {
  return `
    <div class="form-field">
      <label class="form-field__label" for="affiliateReferralLink">Your Referral Link</label>
      <div class="account-affiliate__link-row">
        <input type="text" id="affiliateReferralLink" class="form-field__input" value="${escapeHtml(link)}" readonly />
        <button type="button" class="btn btn--secondary btn--sm" data-action="copy-referral-link" data-link="${escapeHtml(link)}">Copy</button>
      </div>
      <p class="admin-product-form__hint">Share this link, or add <code>?ref=${escapeHtml(link.split("ref=")[1] || "")}</code> to any Seasonedz product page link.</p>
    </div>
  `;
}

function renderPayoutStatusMessage(totals, payoutDayOfMonth) {
  if (totals.approvedUnpaidTotal <= 0) {
    return `<p class="admin-product-form__hint">No approved balance yet.</p>`;
  }
  if (totals.isPayoutEligible) {
    return `<p class="admin-product-form__hint">Your approved balance has reached the minimum payout amount — Seasonedz Group will arrange payment, targeted for the ${payoutDayOfMonth}${daySuffix(payoutDayOfMonth)} of the following month.</p>`;
  }
  return `<p class="admin-product-form__hint">Your approved balance will carry forward until it reaches the minimum payout amount of R${totals.minimumPayoutAmount.toFixed(2)} — nothing you've earned is ever lost.</p>`;
}

function daySuffix(day) {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

function renderRecentCommissionsTable(commissions) {
  if (commissions.length === 0) {
    return `<p class="admin-product-form__hint">No referred orders yet.</p>`;
  }
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Order</th><th>Date</th><th>Qualifying Amount</th><th>Commission</th><th>Status</th></tr></thead>
        <tbody>
          ${commissions
            .map(
              (row) => `
            <tr>
              <td>${escapeHtml(row.orderNumber)}</td>
              <td>${formatDate(row.orderDate)}</td>
              <td>${formatRand(row.qualifyingProductSubtotal)}</td>
              <td>${formatRand(row.commissionAmount)}</td>
              <td><span class="badge">${humanizeEnum(row.commissionStatus)}</span></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderActiveAffiliatePortal(affiliate) {
  return `
    <div class="order-confirmation__row"><span>Status</span><span class="badge">Active</span></div>
    <div class="order-confirmation__row"><span>Referral Code</span><span>${escapeHtml(affiliate.referralCode)}</span></div>
    ${renderReferralLink(affiliate.referralLink)}
    <div class="order-confirmation__row"><span>Your Customer Discount Rate</span><span>${affiliate.effectiveDiscountRate}%</span></div>
    <div class="order-confirmation__row"><span>Your Commission Rate</span><span>${affiliate.effectiveCommissionRate}%</span></div>

    <h4 class="checkout-section__label">Commission Balance</h4>
    <div class="admin-cards">
      <div class="admin-card"><p class="admin-card__label">Pending</p><p class="admin-card__value">${formatRand(affiliate.commissionTotals.pendingTotal)}</p></div>
      <div class="admin-card"><p class="admin-card__label">Approved, unpaid</p><p class="admin-card__value">${formatRand(affiliate.commissionTotals.approvedUnpaidTotal)}</p></div>
      <div class="admin-card"><p class="admin-card__label">Paid (lifetime)</p><p class="admin-card__value">${formatRand(affiliate.commissionTotals.paidLifetimeTotal)}</p></div>
      <div class="admin-card"><p class="admin-card__label">Reversed</p><p class="admin-card__value">${formatRand(affiliate.commissionTotals.reversedTotal)}</p></div>
    </div>
    ${renderPayoutStatusMessage(affiliate.commissionTotals, affiliate.payoutDayOfMonth)}
    <p class="admin-product-form__hint">Payouts are arranged manually by Seasonedz Group, monthly, once your approved balance reaches R${affiliate.commissionTotals.minimumPayoutAmount.toFixed(2)}.</p>

    <h4 class="checkout-section__label">Recent Referred Orders</h4>
    ${renderRecentCommissionsTable(affiliate.recentCommissions)}
    <p class="admin-product-form__hint">
      When sharing your link, please disclose your affiliate relationship — e.g. "I may earn a commission if you purchase through my Seasonedz referral link."
      See the <a href="/affiliate-terms">Affiliate Programme Terms</a> for full details.
    </p>
  `;
}

function renderPendingAffiliatePortal() {
  return `
    <div class="order-confirmation__row"><span>Status</span><span class="badge">Pending</span></div>
    <p class="admin-product-form__hint">Your application to join the Seasonedz Affiliate Programme is awaiting review. We'll approve genuine applications as soon as we can — no referral tools are active yet.</p>
  `;
}

function renderSuspendedAffiliatePortal(affiliate) {
  return `
    <div class="order-confirmation__row"><span>Status</span><span class="badge">Suspended</span></div>
    <p class="admin-product-form__hint">Your affiliate account is currently suspended — new referrals are not active. Contact Seasonedz Group if you believe this is a mistake.</p>
    ${affiliate.recentCommissions.length ? `<h4 class="checkout-section__label">Historical Referred Orders</h4>${renderRecentCommissionsTable(affiliate.recentCommissions)}` : ""}
  `;
}

function renderRejectedAffiliatePortal() {
  return `
    <div class="order-confirmation__row"><span>Status</span><span class="badge">Not Approved</span></div>
    <p class="admin-product-form__hint">Your affiliate application was not approved. Contact Seasonedz Group if you have questions.</p>
  `;
}

function renderNoAffiliateSection() {
  return `
    <p class="admin-product-form__hint">
      Earn a commission for every genuine sale you refer to Seasonedz Group, and give your friends a discount too.
      Read the <a href="/affiliate-terms">Affiliate Programme Terms</a>, then apply below.
    </p>
    <div class="form-banner form-banner--error" data-affiliate-apply-banner hidden></div>
    <button type="button" class="btn btn--primary" data-action="apply-for-affiliate">Apply to Become an Affiliate</button>
  `;
}

// Best-effort, same discipline as renderConnectedAccountsSection()/
// renderMyOrdersSection() above — a failed fetch never breaks the rest
// of the account page.
async function renderAffiliateProgrammeSection() {
  let response;
  try {
    response = await getMyAffiliatePortal();
  } catch {
    return "";
  }

  const { hasAffiliate, affiliate } = response.data;

  let body;
  if (!hasAffiliate) {
    body = renderNoAffiliateSection();
  } else if (affiliate.status === "ACTIVE") {
    body = renderActiveAffiliatePortal(affiliate);
  } else if (affiliate.status === "PENDING") {
    body = renderPendingAffiliatePortal();
  } else if (affiliate.status === "SUSPENDED") {
    body = renderSuspendedAffiliatePortal(affiliate);
  } else {
    body = renderRejectedAffiliatePortal();
  }

  return `
    <div class="order-confirmation__card account-affiliate">
      <h2 class="checkout-section__label">Affiliate Programme</h2>
      ${body}
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

      ${await renderAffiliateProgrammeSection()}

      ${await renderMyOrdersSection()}

      ${await renderNotificationsSection()}

      ${await renderNotificationPreferencesSection()}

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
