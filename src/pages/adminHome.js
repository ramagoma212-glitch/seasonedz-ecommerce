// Admin home page (Version 7, Milestone 58 — foundation only).
// A protected placeholder only — no orders, enquiries, customer
// details or product management here yet. Confirms the visitor is
// authenticated (via GET /api/admin/auth/me) before rendering
// anything, and redirects to the login page otherwise. See
// VERSION_7_ADMIN_DASHBOARD_PLAN.md for what future milestones will
// add here.

import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { ApiError } from "../js/apiClient.js";
import { escapeHtml } from "../js/search.js";

export async function renderAdminHome() {
  try {
    const response = await getCurrentAdmin();
    const admin = response.data.admin;

    return `
      <section class="stub-page container admin-home-page">
        <h1 class="stub-page__title">Admin</h1>
        <p class="stub-page__text">
          Admin area coming next. You are signed in as
          ${escapeHtml(admin.name)} (${escapeHtml(admin.email)}).
        </p>
        <button type="button" class="btn btn--secondary" data-action="admin-logout">Sign Out</button>
      </section>
    `;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      window.location.hash = "/admin/login";
      return `
        <section class="stub-page container">
          <p class="stub-page__text">Sign in required. Redirecting...</p>
        </section>
      `;
    }

    return `
      <section class="stub-page container">
        <h1 class="stub-page__title">Admin</h1>
        <div class="form-banner form-banner--error">
          We could not connect to the admin system right now. Please try again shortly.
        </div>
      </section>
    `;
  }
}
