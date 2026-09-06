// Milestone 182: admin list of CampaignBrief rows. Same table/CSS shape
// as adminContentPillars.js/adminProducts.js — no new design system.

import { getAdminCampaignBriefs } from "../js/api/campaignBriefApi.js";
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
import { formatDate, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const STATUS_OPTIONS = ["DRAFT", "READY_FOR_ZEELY", "CREATED_IN_ZEELY", "APPROVED", "SCHEDULED", "PUBLISHED", "ARCHIVED"];

function renderFilters(query) {
  const status = query.get("status") || "";
  return `
    <form class="admin-product-filters" data-admin-campaign-brief-filter-form>
      <select name="status" class="form-field__input">
        <option value="">All statuses</option>
        ${STATUS_OPTIONS.map((option) => `<option value="${option}"${option === status ? " selected" : ""}>${escapeHtml(humanizeEnum(option))}</option>`).join("")}
      </select>
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderBriefsTable(briefs) {
  if (briefs.length === 0) {
    return `<p class="admin-empty">No campaign briefs yet. Use "New Campaign Brief" to prepare the first one.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Audience</th>
            <th>Pillar</th>
            <th>Goal</th>
            <th>Status</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${briefs
            .map(
              (brief) => `
            <tr>
              <td>${brief.product ? escapeHtml(brief.product.name) : "N/A"}</td>
              <td>${brief.audience ? escapeHtml(brief.audience.name) : "N/A"}</td>
              <td>${brief.pillar ? escapeHtml(brief.pillar.name) : "N/A"}</td>
              <td>${escapeHtml(humanizeEnum(brief.goal))}</td>
              <td>${renderStatusBadge(brief.status)}</td>
              <td>${formatDate(brief.updatedAt)}</td>
              <td><a href="/admin/content-studio/campaign-briefs/${encodeURIComponent(brief.id)}" class="admin-section__link">Open</a></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPagination(result, query) {
  if (result.totalPages <= 1) return "";

  const prevDisabled = result.page <= 1;
  const nextDisabled = result.page >= result.totalPages;

  function pageLink(page) {
    const params = new URLSearchParams(query);
    params.set("page", page);
    return `/admin/content-studio/campaign-briefs?${params.toString()}`;
  }

  return `
    <div class="admin-pagination">
      ${prevDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Previous</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page - 1)}">Previous</a>`}
      <span class="admin-pagination__label">Page ${result.page} of ${result.totalPages}</span>
      ${nextDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Next</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page + 1)}">Next</a>`}
    </div>
  `;
}

export async function renderAdminCampaignBriefs({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const status = effectiveQuery.get("status") || undefined;
  const page = Number(effectiveQuery.get("page")) || 1;

  try {
    const response = await getAdminCampaignBriefs({ status, page });
    const result = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("campaign-briefs")}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Campaign Briefs</h2>
          <a class="btn btn--primary btn--sm" href="/admin/content-studio/campaign-briefs/new">New Campaign Brief</a>
        </div>
        <p class="admin-page__subtitle">
          A campaign brief is prepared here from real product data and stored brand knowledge, then copied into Zeely
          to actually create the content.
        </p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderFilters(effectiveQuery)}
        ${renderBriefsTable(result.briefs)}
        ${renderPagination(result, effectiveQuery)}
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
