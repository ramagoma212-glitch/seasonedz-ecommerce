// Content Studio Phase 2: admin list of Audience rows — marketing
// audiences, never customer records (brief section 16). Same
// table/CSS shape as adminContentPillars.js.

import { getAdminAudiences } from "../js/api/contentStudioApi.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
  consumePendingAdminMessage,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderContentStudioSubNav } from "../components/contentStudioSubNav.js";
import { renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderFilters(query) {
  const search = query.get("search") || "";
  const status = query.get("isActive") || "";

  return `
    <form class="admin-product-filters" data-admin-audience-filter-form>
      <input type="search" name="search" placeholder="Search audience name" value="${escapeHtml(search)}" class="form-field__input" />
      <select name="isActive" class="form-field__input">
        <option value="">All audiences</option>
        <option value="true"${status === "true" ? " selected" : ""}>Active only</option>
        <option value="false"${status === "false" ? " selected" : ""}>Inactive only</option>
      </select>
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderAudiencesTable(audiences) {
  if (audiences.length === 0) {
    return `<p class="admin-empty">No audiences yet. Use "Add Audience" to create the first one.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Description</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${audiences
            .map(
              (audience) => `
            <tr data-audience-row="${escapeHtml(audience.id)}">
              <td>${escapeHtml(audience.name)}</td>
              <td>${audience.description ? escapeHtml(audience.description) : "N/A"}</td>
              <td>${renderStatusBadge(audience.isActive ? "ACTIVE" : "INACTIVE")}</td>
              <td class="admin-table__actions">
                <a href="/admin/content-studio/audiences/${encodeURIComponent(audience.id)}/edit" class="admin-section__link">Edit</a>
                ${
                  audience.isActive
                    ? `<button type="button" class="btn btn--secondary btn--sm" data-action="deactivate-audience" data-audience-id="${escapeHtml(audience.id)}">Deactivate</button>`
                    : `<button type="button" class="btn btn--secondary btn--sm" data-action="reactivate-audience" data-audience-id="${escapeHtml(audience.id)}">Reactivate</button>`
                }
              </td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminAudiences({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const search = effectiveQuery.get("search") || undefined;
  const isActiveRaw = effectiveQuery.get("isActive");
  const isActive = isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : undefined;

  try {
    const response = await getAdminAudiences({ search, isActive });
    const audiences = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("audiences")}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Audiences</h2>
          <a class="btn btn--primary btn--sm" href="/admin/content-studio/audiences/new">Add Audience</a>
        </div>
        <p class="admin-page__subtitle">Named marketing audiences, never individual customer records.</p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div class="form-banner form-banner--error" data-admin-audience-banner hidden></div>
        ${renderFilters(effectiveQuery)}
        ${renderAudiencesTable(audiences)}
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}
