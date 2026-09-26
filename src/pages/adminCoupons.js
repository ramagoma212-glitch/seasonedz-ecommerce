// Milestone 197, Part 4: admin coupon list. Same admin-table/admin-badge
// shape as adminReferralAffiliates.js — no new design system. Coupons are
// expected to stay few in number (a V1, practical feature per this
// milestone's own Part 12), so unlike the affiliates/products lists there
// is deliberately no pagination or filter form here — just one flat list,
// newest first (already the backend's own ordering — see coupon.service.ts's
// listCouponsForAdmin()).

import { getAdminCoupons } from "../js/api/adminCouponApi.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
  consumePendingAdminMessage,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { formatDate, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

// Derived purely for display — never stored, never sent anywhere. The
// backend's own resolve() (coupon.service.ts) is the sole authority on
// whether a coupon actually works; this only decides which badge a human
// sees on the list (Part 4's own explicit "Active/Inactive/Expired/
// Scheduled" requirement).
function deriveDisplayStatus(coupon) {
  if (!coupon.isActive) return "INACTIVE";
  const now = new Date();
  if (coupon.expiresAt && now >= new Date(coupon.expiresAt)) return "EXPIRED";
  if (coupon.startsAt && now < new Date(coupon.startsAt)) return "SCHEDULED";
  return "ACTIVE";
}

function renderDiscountLabel(coupon) {
  if (coupon.discountType === "PERCENTAGE") {
    const cap = coupon.maximumDiscountAmount ? `, up to R${Number(coupon.maximumDiscountAmount).toFixed(2)}` : "";
    return `${Number(coupon.discountValue)}% off${cap}`;
  }
  return `R${Number(coupon.discountValue).toFixed(2)} off`;
}

function renderUsageLabel(coupon) {
  return coupon.maxTotalUses === null ? `${coupon.timesRedeemed} used` : `${coupon.timesRedeemed} / ${coupon.maxTotalUses} used`;
}

function renderExpiryLabel(coupon) {
  return coupon.expiresAt ? `Expires ${formatDate(coupon.expiresAt)}` : "No expiry";
}

function renderActionButtons(coupon) {
  const buttons = [];
  if (coupon.isActive) {
    buttons.push(`<button type="button" class="btn btn--secondary btn--sm" data-action="deactivate-coupon" data-coupon-id="${escapeHtml(coupon.id)}">Deactivate</button>`);
  } else {
    buttons.push(`<button type="button" class="btn btn--secondary btn--sm" data-action="activate-coupon" data-coupon-id="${escapeHtml(coupon.id)}">Activate</button>`);
  }
  if (coupon.timesRedeemed === 0) {
    buttons.push(`<button type="button" class="btn btn--danger btn--sm" data-action="delete-coupon" data-coupon-id="${escapeHtml(coupon.id)}">Delete</button>`);
  }
  return buttons.join("");
}

function renderCouponsTable(coupons) {
  if (coupons.length === 0) {
    return `<p class="admin-empty">No coupons yet. Use "Add Coupon" to create the first one.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Discount</th>
            <th>Usage</th>
            <th>Total Discount Granted</th>
            <th>Expiry</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${coupons
            .map(
              (coupon) => `
            <tr data-coupon-row="${escapeHtml(coupon.id)}">
              <td>${escapeHtml(coupon.code)}</td>
              <td>${escapeHtml(renderDiscountLabel(coupon))}</td>
              <td>${escapeHtml(renderUsageLabel(coupon))}</td>
              <td>R${Number(coupon.totalDiscountGranted).toFixed(2)}</td>
              <td>${escapeHtml(renderExpiryLabel(coupon))}</td>
              <td>${renderStatusBadge(deriveDisplayStatus(coupon))}</td>
              <td class="admin-table__actions">
                <a href="/admin/coupons/${encodeURIComponent(coupon.id)}/edit" class="admin-section__link">Edit</a>
                ${renderActionButtons(coupon)}
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

export async function renderAdminCoupons() {
  try {
    const response = await getAdminCoupons();
    const coupons = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("coupons")}
        <h1 class="admin-page__title">Coupons</h1>

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Coupon Codes</h2>
          <a class="btn btn--primary btn--sm" href="/admin/coupons/new">Add Coupon</a>
        </div>
        <p class="admin-page__subtitle">${coupons.length} coupon${coupons.length === 1 ? "" : "s"} total</p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div class="form-banner form-banner--error" data-admin-coupon-banner hidden></div>
        ${renderCouponsTable(coupons)}
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
