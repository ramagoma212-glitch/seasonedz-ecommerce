// Content Studio Phase 2: admin list of BrandKnowledgeEntry rows. Same
// table/pagination shape as adminReferralAffiliates.js.

import { getAdminBrandKnowledgeEntries } from "../js/api/contentStudioApi.js";
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
import { humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const CATEGORY_OPTIONS = [
  "BRAND_FACT",
  "BRAND_VOICE",
  "WRITING_RULE",
  "VISUAL_RULE",
  "PRODUCT_POSITIONING",
  "AUDIENCE_INSIGHT",
  "APPROVED_CLAIM",
  "PROHIBITED_CLAIM",
  "TERMINOLOGY",
  "CALL_TO_ACTION",
  "PLATFORM_RULE",
  "SEASONAL_GUIDANCE",
  "CAMPAIGN_HISTORY",
];

function renderFilters(query) {
  const search = query.get("search") || "";
  const category = query.get("category") || "";
  const isActive = query.get("isActive") || "";
  const tag = query.get("tag") || "";

  return `
    <form class="admin-product-filters" data-admin-brand-knowledge-filter-form>
      <input type="search" name="search" placeholder="Search title or body" value="${escapeHtml(search)}" class="form-field__input" />
      <select name="category" class="form-field__input">
        <option value="">All categories</option>
        ${CATEGORY_OPTIONS.map((option) => `<option value="${option}"${option === category ? " selected" : ""}>${humanizeEnum(option)}</option>`).join("")}
      </select>
      <input type="text" name="tag" placeholder="Filter by tag" value="${escapeHtml(tag)}" class="form-field__input" />
      <select name="isActive" class="form-field__input">
        <option value="">All entries</option>
        <option value="true"${isActive === "true" ? " selected" : ""}>Active only</option>
        <option value="false"${isActive === "false" ? " selected" : ""}>Inactive only</option>
      </select>
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function renderEntriesTable(entries) {
  if (entries.length === 0) {
    return `<p class="admin-empty">No brand knowledge entries yet. Use "Add Entry" to create the first one.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Category</th>
            <th>Source</th>
            <th>Tags</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              (entry) => `
            <tr data-entry-row="${escapeHtml(entry.id)}">
              <td>${escapeHtml(entry.title)}<br><span class="admin-table__meta">${escapeHtml(truncate(entry.body, 80))}</span></td>
              <td>${humanizeEnum(entry.category)}</td>
              <td>${humanizeEnum(entry.sourceType)}</td>
              <td>${entry.tags.length > 0 ? entry.tags.map((tag) => `<span class="admin-badge admin-badge--neutral">${escapeHtml(tag)}</span>`).join(" ") : "N/A"}</td>
              <td>${renderStatusBadge(entry.isActive ? "ACTIVE" : "INACTIVE")}</td>
              <td class="admin-table__actions">
                <a href="/admin/content-studio/brand-knowledge/${encodeURIComponent(entry.id)}/edit" class="admin-section__link">Edit</a>
                ${
                  entry.isActive
                    ? `<button type="button" class="btn btn--secondary btn--sm" data-action="deactivate-entry" data-entry-id="${escapeHtml(entry.id)}">Deactivate</button>`
                    : `<button type="button" class="btn btn--secondary btn--sm" data-action="reactivate-entry" data-entry-id="${escapeHtml(entry.id)}">Reactivate</button>`
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

function renderPagination(result, query) {
  if (result.totalPages <= 1) return "";

  const prevDisabled = result.page <= 1;
  const nextDisabled = result.page >= result.totalPages;

  function pageLink(page) {
    const params = new URLSearchParams(query);
    params.set("page", page);
    return `/admin/content-studio?${params.toString()}`;
  }

  return `
    <div class="admin-pagination">
      ${prevDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Previous</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page - 1)}">Previous</a>`}
      <span class="admin-pagination__label">Page ${result.page} of ${result.totalPages}</span>
      ${nextDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Next</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page + 1)}">Next</a>`}
    </div>
  `;
}

export async function renderAdminBrandKnowledge({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const page = Number(effectiveQuery.get("page")) || 1;
  const search = effectiveQuery.get("search") || undefined;
  const category = effectiveQuery.get("category") || undefined;
  const tag = effectiveQuery.get("tag") || undefined;
  const isActiveRaw = effectiveQuery.get("isActive");
  const isActive = isActiveRaw === "true" ? true : isActiveRaw === "false" ? false : undefined;

  try {
    const response = await getAdminBrandKnowledgeEntries({ page, search, category, tag, isActive });
    const result = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("brand-knowledge")}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Brand Knowledge</h2>
          <a class="btn btn--primary btn--sm" href="/admin/content-studio/brand-knowledge/new">Add Entry</a>
        </div>
        <p class="admin-page__subtitle">
          ${result.total} entr${result.total === 1 ? "y" : "ies"} total. Structured facts, voice rules and marketing guidance a future AI
          system will retrieve from. Never a substitute for a Product's own price, stock or name, which stays authoritative on the Products page.
        </p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div class="form-banner form-banner--error" data-admin-brand-knowledge-banner hidden></div>
        ${renderFilters(effectiveQuery)}
        ${renderEntriesTable(result.entries)}
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
