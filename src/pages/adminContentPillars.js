// Content Studio Phase 2: admin list of ContentPillar rows. Same
// table/CSS shape as adminReferralAffiliates.js — no new design system.
// Unlike Affiliates, pillars have no pagination (brief section 14's
// own small, deliberately flat catalogue of marketing categories).

import { getAdminContentPillars } from "../js/api/contentStudioApi.js";
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
    <form class="admin-product-filters" data-admin-content-pillar-filter-form>
      <input type="search" name="search" placeholder="Search pillar name" value="${escapeHtml(search)}" class="form-field__input" />
      <select name="isActive" class="form-field__input">
        <option value="">All pillars</option>
        <option value="true"${status === "true" ? " selected" : ""}>Active only</option>
        <option value="false"${status === "false" ? " selected" : ""}>Inactive only</option>
      </select>
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderPillarsTable(pillars) {
  if (pillars.length === 0) {
    return `<p class="admin-empty">No content pillars yet. Use "Add Pillar" to create the first one.</p>`;
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
          ${pillars
            .map(
              (pillar) => `
            <tr data-pillar-row="${escapeHtml(pillar.id)}">
              <td>${escapeHtml(pillar.name)}</td>
              <td>${pillar.description ? escapeHtml(pillar.description) : "N/A"}</td>
              <td>${renderStatusBadge(pillar.isActive ? "ACTIVE" : "INACTIVE")}</td>
              <td class="admin-table__actions">
                <a href="/admin/content-studio/pillars/${encodeURIComponent(pillar.id)}/edit" class="admin-section__link">Edit</a>
                ${
                  pillar.isActive
                    ? `<button type="button" class="btn btn--secondary btn--sm" data-action="deactivate-pillar" data-pillar-id="${escapeHtml(pillar.id)}">Deactivate</button>`
                    : `<button type="button" class="btn btn--secondary btn--sm" data-action="reactivate-pillar" data-pillar-id="${escapeHtml(pillar.id)}">Reactivate</button>`
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

export async function renderAdminContentPillars({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const search = effectiveQuery.get("search") || undefined;
  const isActiveRaw = effectiveQuery.get("isActive");
  const isActive = isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : undefined;

  try {
    const response = await getAdminContentPillars({ search, isActive });
    const pillars = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("pillars")}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Content Pillars</h2>
          <a class="btn btn--primary btn--sm" href="/admin/content-studio/pillars/new">Add Pillar</a>
        </div>
        <p class="admin-page__subtitle">Named marketing content categories used to steer future content generation. Database managed, not hard-coded.</p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div class="form-banner form-banner--error" data-admin-content-pillar-banner hidden></div>
        ${renderFilters(effectiveQuery)}
        ${renderPillarsTable(pillars)}
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
