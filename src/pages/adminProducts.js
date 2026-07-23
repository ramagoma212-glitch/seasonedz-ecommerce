// Admin products list page (Version 7, Milestone 67). Read-only view
// with links through to the create/edit pages — no delete button, no
// bulk action, matching the milestone's explicit scope. Uses the
// existing, already-live, requireAdminAuth-protected product routes
// from Milestone 66; nothing new on the backend.

import { getAdminProducts } from "../js/api/adminDashboardApi.js";
import { apiGet } from "../js/apiClient.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { formatCurrency, formatDate, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const STATUS_OPTIONS = ["DRAFT", "ACTIVE", "ARCHIVED", "OUT_OF_STOCK"];

function renderFilters(categories, query) {
  const search = query.get("search") || "";
  const status = query.get("status") || "";
  const categoryId = query.get("categoryId") || "";

  return `
    <form class="admin-product-filters" data-admin-product-filter-form>
      <input
        type="search"
        name="search"
        placeholder="Search name, SKU or slug"
        value="${escapeHtml(search)}"
        class="form-field__input"
      />
      <select name="status" class="form-field__input">
        <option value="">All statuses</option>
        ${STATUS_OPTIONS.map(
          (option) => `<option value="${option}"${option === status ? " selected" : ""}>${escapeHtml(humanizeEnum(option))}</option>`
        ).join("")}
      </select>
      <select name="categoryId" class="form-field__input">
        <option value="">All categories</option>
        ${categories
          .map((category) => `<option value="${category.id}"${category.id === categoryId ? " selected" : ""}>${escapeHtml(category.name)}</option>`)
          .join("")}
      </select>
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderFlags(product) {
  const flags = [
    product.isFeatured && "Featured",
    product.isBestSeller && "Best Seller",
    product.isNewArrival && "New Arrival",
  ].filter(Boolean);
  return flags.length > 0 ? escapeHtml(flags.join(", ")) : "—";
}

function renderProductsTable(products) {
  if (products.length === 0) {
    return `<p class="admin-empty">No products found.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>SKU</th>
            <th>Category</th>
            <th>Price</th>
            <th>Stock</th>
            <th>Threshold</th>
            <th>Status</th>
            <th>Flags</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${products
            .map(
              (product) => `
            <tr>
              <td>${escapeHtml(product.name)}</td>
              <td>${escapeHtml(product.sku || "—")}</td>
              <td>${escapeHtml(product.category.name)}</td>
              <td>${formatCurrency(product.price)}</td>
              <td>${product.stockQuantity}</td>
              <td>${product.lowStockThreshold}</td>
              <td>${renderStatusBadge(product.status)}</td>
              <td>${renderFlags(product)}</td>
              <td>${formatDate(product.updatedAt)}</td>
              <td><a href="/admin/products/${encodeURIComponent(product.id)}/edit" class="admin-section__link">Edit</a></td>
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

  // Hotfix 106C: real path, not a hash fragment — see adminNav.js's own
  // comment for why this was missed by the Milestone 88A migration.
  function pageLink(page) {
    const params = new URLSearchParams(query);
    params.set("page", page);
    return `/admin/products?${params.toString()}`;
  }

  return `
    <div class="admin-pagination">
      ${prevDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Previous</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page - 1)}">Previous</a>`}
      <span class="admin-pagination__label">Page ${result.page} of ${result.totalPages}</span>
      ${nextDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Next</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page + 1)}">Next</a>`}
    </div>
  `;
}

export async function renderAdminProducts({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const page = Number(effectiveQuery.get("page")) || 1;
  const search = effectiveQuery.get("search") || undefined;
  const status = effectiveQuery.get("status") || undefined;
  const categoryId = effectiveQuery.get("categoryId") || undefined;

  try {
    const [productsResponse, categoriesResponse] = await Promise.all([
      getAdminProducts({ page, search, status, categoryId }),
      apiGet("/categories"),
    ]);
    const result = productsResponse.data;
    const categories = categoriesResponse.data.categories;

    return `
      <section class="container admin-page">
        ${renderAdminNav("products")}
        <div class="admin-section__header">
          <h1 class="admin-page__title">Products</h1>
          <a class="btn btn--primary btn--sm" href="/admin/products/new">Add Product</a>
        </div>
        <p class="admin-page__subtitle">${result.total} product${result.total === 1 ? "" : "s"} total</p>
        ${renderFilters(categories, effectiveQuery)}
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
