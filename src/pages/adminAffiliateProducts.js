// Version 7, Milestone 172B: admin affiliate-product list page. Same
// shape as adminProducts.js — read-only table with links through to
// the create/edit pages, reusing the existing admin-table/admin-badge/
// pagination CSS this project already has. No new design system.
//
// This page never creates a public "Recommended Books" listing by
// itself — it only manages AffiliateProduct rows through the admin
// API. The public page and its own read API are Milestone 172C.

import { getAdminAffiliateProducts } from "../js/api/adminAffiliateApi.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
  consumePendingAdminMessage,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { formatDate } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderFilters(query) {
  const search = query.get("search") || "";
  const isActive = query.get("isActive") || "";

  return `
    <form class="admin-product-filters" data-admin-affiliate-filter-form>
      <input
        type="search"
        name="search"
        placeholder="Search title, author or merchant"
        value="${escapeHtml(search)}"
        class="form-field__input"
      />
      <select name="isActive" class="form-field__input">
        <option value="">All statuses</option>
        <option value="true"${isActive === "true" ? " selected" : ""}>Active</option>
        <option value="false"${isActive === "false" ? " selected" : ""}>Inactive</option>
      </select>
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderPriceCell(product) {
  if (product.price === null) return "&mdash;";
  const checked = product.priceLastCheckedAt ? formatDate(product.priceLastCheckedAt) : "never checked";
  return `${escapeHtml(product.currency)} ${product.price.toFixed(2)}<span class="admin-table__meta">Checked: ${escapeHtml(checked)}</span>`;
}

function renderFlags(product) {
  const flags = [product.isFeatured && "Featured", !product.isActive && "Inactive"].filter(Boolean);
  return flags.length > 0 ? escapeHtml(flags.join(", ")) : "&mdash;";
}

function renderProductsTable(products) {
  if (products.length === 0) {
    return `<p class="admin-empty">No affiliate products yet. Use "Add Affiliate Product" to create the first one.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Merchant</th>
            <th>Network</th>
            <th>Price</th>
            <th>Flags</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${products
            .map(
              (product) => `
            <tr data-affiliate-product-row="${escapeHtml(product.id)}">
              <td>${escapeHtml(product.title)}${product.author ? `<span class="admin-table__meta">${escapeHtml(product.author)}</span>` : ""}</td>
              <td>${escapeHtml(product.merchantName)}</td>
              <td>${escapeHtml(product.affiliateNetwork || "N/A")}</td>
              <td>${renderPriceCell(product)}</td>
              <td>${renderFlags(product)}</td>
              <td>${formatDate(product.updatedAt)}</td>
              <td class="admin-table__actions">
                <a href="/admin/affiliate/${encodeURIComponent(product.id)}/edit" class="admin-section__link">Edit</a>
                ${
                  product.isActive
                    ? `<button type="button" class="btn btn--secondary btn--sm" data-action="deactivate-affiliate-product" data-affiliate-product-id="${escapeHtml(product.id)}">Deactivate</button>`
                    : `<button type="button" class="btn btn--secondary btn--sm" data-action="activate-affiliate-product" data-affiliate-product-id="${escapeHtml(product.id)}">Activate</button>`
                }
                ${
                  product.isFeatured
                    ? `<button type="button" class="btn btn--secondary btn--sm" data-action="unfeature-affiliate-product" data-affiliate-product-id="${escapeHtml(product.id)}">Unfeature</button>`
                    : `<button type="button" class="btn btn--secondary btn--sm" data-action="feature-affiliate-product" data-affiliate-product-id="${escapeHtml(product.id)}">Feature</button>`
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
    return `/admin/affiliate?${params.toString()}`;
  }

  return `
    <div class="admin-pagination">
      ${prevDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Previous</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page - 1)}">Previous</a>`}
      <span class="admin-pagination__label">Page ${result.page} of ${result.totalPages}</span>
      ${nextDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Next</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page + 1)}">Next</a>`}
    </div>
  `;
}

export async function renderAdminAffiliateProducts({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const page = Number(effectiveQuery.get("page")) || 1;
  const search = effectiveQuery.get("search") || undefined;
  const isActive = effectiveQuery.get("isActive") || undefined;

  try {
    const response = await getAdminAffiliateProducts({ page, search, isActive });
    const result = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("affiliate")}
        <div class="admin-section__header">
          <h1 class="admin-page__title">Affiliate Products</h1>
          <a class="btn btn--primary btn--sm" href="/admin/affiliate/new">Add Affiliate Product</a>
        </div>
        <p class="admin-page__subtitle">
          ${result.total} affiliate product${result.total === 1 ? "" : "s"} total &mdash; not yet shown anywhere on the public site.
        </p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div class="form-banner form-banner--error" data-admin-affiliate-banner hidden></div>
        ${renderFilters(effectiveQuery)}
        ${renderProductsTable(result.products)}
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
