// Shared auth-guard helpers used by every protected admin page
// (Version 7, Milestones 58-59): recognising a 401/unreachable-backend
// response, redirecting to login, and rendering the two placeholder
// states every admin page needs on failure — kept here once rather
// than each page repeating the same markup and status check.

import { ApiError, ApiUnavailableError } from "./apiClient.js";
import { navigateTo } from "./navigation.js";

export function isUnauthenticated(error) {
  return error instanceof ApiError && error.status === 401;
}

// Milestone 179, Part G: the admin-users management area is ADMIN-only
// end to end (backend-enforced — see requireAdminRole in
// adminUsers.routes.ts). A signed-in STAFF member reaching this link is
// authenticated but not authorised, so this is distinct from
// isUnauthenticated() above: never redirect to login (they already have
// a valid session), just explain access is restricted.
export function isForbidden(error) {
  return error instanceof ApiError && error.status === 403;
}

export function isBackendUnavailable(error) {
  return error instanceof ApiUnavailableError;
}

export function redirectToAdminLogin() {
  navigateTo("/admin/login");
}

export function renderAdminRedirecting() {
  return `
    <section class="stub-page container">
      <p class="stub-page__text">Sign in required. Redirecting...</p>
    </section>
  `;
}

export function renderAdminForbidden() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Admin</h1>
      <div class="form-banner form-banner--error">You do not have permission to view this page.</div>
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

// Version 7, Milestone 64: a one-shot success message carried across a
// rerenderCurrentRoute() call (app.js sets it right before triggering
// the rerender; the page's own render function reads and clears it on
// its next render) — this is how "show a success banner after a
// status update, then refresh the page in place" works without a full
// navigation or a framework-level state store.
let pendingAdminMessage = null;

export function setPendingAdminMessage(message) {
  pendingAdminMessage = message;
}

export function consumePendingAdminMessage() {
  const message = pendingAdminMessage;
  pendingAdminMessage = null;
  return message;
}
