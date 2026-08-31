// Milestone 179, Part G: minimal ADMIN-only admin-user management —
// /admin/users. Same table shape as adminReferralAffiliates.js, reusing
// the existing admin-table/admin-badge CSS. Never shows a password,
// OTP code, reset/invitation/session token — only Name/Email/Role/
// Status/Last Login/Created Date, matching the backend's own
// AdminUserSummary shape exactly (adminUsers.service.ts).

import { getAdminUsers } from "../js/api/adminUsersApi.js";
import {
  isBackendUnavailable,
  isForbidden,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminForbidden,
  renderAdminRedirecting,
  consumePendingAdminMessage,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { formatDateTime } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderStatusCell(admin) {
  if (admin.invitationPending) return `<span class="admin-badge admin-badge--neutral">Invitation Sent</span>`;
  return `<span class="admin-badge ${admin.isActive ? "admin-badge--success" : "admin-badge--danger"}">${admin.isActive ? "Active" : "Inactive"}</span>`;
}

function renderActionButtons(admin) {
  const buttons = [];
  const otherRole = admin.role === "ADMIN" ? "STAFF" : "ADMIN";

  if (admin.invitationPending) {
    buttons.push(`<button type="button" class="btn btn--secondary btn--sm" data-action="resend-admin-invitation" data-admin-id="${escapeHtml(admin.id)}">Resend Invitation</button>`);
  } else if (!admin.isActive) {
    buttons.push(`<button type="button" class="btn btn--secondary btn--sm" data-action="activate-admin-user" data-admin-id="${escapeHtml(admin.id)}">Activate</button>`);
  } else {
    buttons.push(`<button type="button" class="btn btn--secondary btn--sm" data-action="deactivate-admin-user" data-admin-id="${escapeHtml(admin.id)}">Deactivate</button>`);
  }

  buttons.push(
    `<button type="button" class="btn btn--secondary btn--sm" data-action="change-admin-user-role" data-admin-id="${escapeHtml(admin.id)}" data-new-role="${otherRole}">Make ${otherRole === "ADMIN" ? "Admin" : "Staff"}</button>`
  );

  return buttons.join("");
}

function renderUsersTable(admins) {
  if (admins.length === 0) {
    return `<p class="admin-empty">No admin users yet.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Last Login</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${admins
            .map(
              (admin) => `
            <tr data-admin-user-row="${escapeHtml(admin.id)}">
              <td>${escapeHtml(admin.name)}</td>
              <td>${escapeHtml(admin.email)}</td>
              <td>${escapeHtml(admin.role)}</td>
              <td>${renderStatusCell(admin)}</td>
              <td>${admin.lastLoginAt ? formatDateTime(admin.lastLoginAt) : "Never"}</td>
              <td>${formatDateTime(admin.createdAt)}</td>
              <td class="admin-table__actions">${renderActionButtons(admin)}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminUsers() {
  try {
    const response = await getAdminUsers();
    const admins = response.data.admins;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("users")}
        <div class="admin-section__header">
          <h1 class="admin-page__title">Admin Users</h1>
          <a class="btn btn--primary btn--sm" href="/admin/users/invite">Invite Admin User</a>
        </div>
        <p class="admin-page__subtitle">Every person accessing Seasonedz Admin has their own account. Credentials are never shared.</p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div class="form-banner form-banner--error" data-admin-users-banner hidden></div>
        ${renderUsersTable(admins)}
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    if (isForbidden(error)) return renderAdminForbidden();
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}
