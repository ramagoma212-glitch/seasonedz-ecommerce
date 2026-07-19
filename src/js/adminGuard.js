// Shared auth-guard helpers used by every protected admin page
// (Version 7, Milestones 58-59): recognising a 401/unreachable-backend
// response, redirecting to login, and rendering the two placeholder
// states every admin page needs on failure — kept here once rather
// than each page repeating the same markup and status check.

import { ApiError, ApiUnavailableError } from "./apiClient.js";

export function isUnauthenticated(error) {
  return error instanceof ApiError && error.status === 401;
}

export function isBackendUnavailable(error) {
  return error instanceof ApiUnavailableError;
}

export function redirectToAdminLogin() {
  window.location.hash = "/admin/login";
}

export function renderAdminRedirecting() {
  return `
    <section class="stub-page container">
      <p class="stub-page__text">Sign in required. Redirecting...</p>
    </section>
  `;
}

export function renderAdminConnectionError(unavailable) {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Admin</h1>
      <div class="form-banner form-banner--error">
        ${
          unavailable
            ? "We could not connect to the admin system right now. Please try again shortly."
            : "Something went wrong loading this page. Please try again shortly."
        }
      </div>
    </section>
  `;
}
