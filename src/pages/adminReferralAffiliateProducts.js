// Milestone 178, Part C: Affiliate Products — per-product commission
// configuration for Seasonedz's OWN affiliate/referral programme.
// Deliberately named and routed apart from adminAffiliateProducts.js
// (172B's dormant, external-merchant AffiliateProduct admin area,
// still mounted at /admin/affiliate) — see AffiliateProductSetting's
// own schema comment for why the two systems are unrelated. Every row
// here always shows Product's OWN live name/price/image/SKU/status —
// nothing on this page is ever copied or cached.

import { getAdminAffiliateProductSettings } from "../js/api/adminReferralsApi.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
  consumePendingAdminMessage,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderReferralsSubNav } from "../components/referralsSubNav.js";
import { escapeHtml } from "../js/search.js";

function renderFilters(query) {
  const search = query.get("search") || "";
  return `
    <form class="admin-product-filters" data-admin-affiliate-product-filter-form>
      <input type="search" name="search" placeholder="Search product name or SKU" value="${escapeHtml(search)}" class="form-field__input" />
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderCommission(item) {
  if (item.commissionType === "FIXED_AMOUNT") {
    return `R${Number(item.fixedCommissionAmount ?? 0).toFixed(2)} per unit`;
  }
  return item.commissionPercent === null ? "Programme default rate" : `${item.commissionPercent}%`;
}

function renderAvailability(item) {
  if (!item.isAffiliateAvailable) return `<span class="admin-badge admin-badge--neutral">Not available</span>`;
  const parts = [];
  if (item.startsAt) parts.push(`from ${new Date(item.startsAt).toLocaleDateString()}`);
  if (item.endsAt) parts.push(`until ${new Date(item.endsAt).toLocaleDateString()}`);
  return `<span class="admin-badge admin-badge--success">Available</span>${parts.length ? `<br /><span class="admin-product-form__hint">${parts.join(", ")}</span>` : ""}`;
}

function renderTable(items) {
  if (items.length === 0) {
    return `<p class="admin-empty">No products configured for the Affiliate Programme yet. Use "Add Affiliate Product" to add the first one.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th></th>
            <th>Product</th>
            <th>SKU</th>
            <th>Price</th>
            <th>Commission</th>
            <th>Max Commission</th>
            <th>Availability</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr data-affiliate-product-row="${escapeHtml(item.id)}">
              <td>${item.productImageUrl ? `<img class="admin-table__thumb" src="${escapeHtml(item.productImageUrl)}" alt="" loading="lazy" />` : ""}</td>
              <td>${escapeHtml(item.productName)}</td>
              <td>${escapeHtml(item.productSku || "N/A")}</td>
              <td>R${Number(item.productPrice).toFixed(2)}</td>
              <td>${renderCommission(item)}</td>
              <td>${item.maximumCommission === null ? "N/A" : `R${Number(item.maximumCommission).toFixed(2)}`}</td>
              <td>${renderAvailability(item)}</td>
              <td class="admin-table__actions">
                <a href="/admin/referrals/affiliate-products/${encodeURIComponent(item.id)}/edit" class="admin-section__link">Edit</a>
                <button type="button" class="btn btn--secondary btn--sm" data-action="remove-affiliate-product" data-affiliate-product-id="${escapeHtml(item.id)}" data-product-name="${escapeHtml(item.productName)}">Remove</button>
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
    return `/admin/referrals/affiliate-products?${params.toString()}`;
  }

  return `
    <div class="admin-pagination">
      ${prevDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Previous</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page - 1)}">Previous</a>`}
      <span class="admin-pagination__label">Page ${result.page} of ${result.totalPages}</span>
      ${nextDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Next</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page + 1)}">Next</a>`}
    </div>
  `;
}

export async function renderAdminReferralAffiliateProducts({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const page = Number(effectiveQuery.get("page")) || 1;
  const search = effectiveQuery.get("search") || undefined;

  try {
    const response = await getAdminAffiliateProductSettings({ page, search });
    const result = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("affiliate-products")}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Affiliate Products</h2>
          <a class="btn btn--primary btn--sm" href="/admin/referrals/affiliate-products/new">Add Affiliate Product</a>
        </div>
        <p class="admin-page__subtitle">
          ${result.total} product${result.total === 1 ? "" : "s"} configured for the Affiliate Programme. Name, price and image are always read live from the product catalogue.
        </p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div class="form-banner form-banner--error" data-admin-affiliate-product-banner hidden></div>
        ${renderFilters(effectiveQuery)}
        ${renderTable(result.items)}
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
