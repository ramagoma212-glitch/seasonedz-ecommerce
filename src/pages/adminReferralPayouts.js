// Version 7, Milestone 172B.5: payout management — no AffiliatePayout
// table (see referralCommission.service.ts's own header comment); this
// page is simply a grouped view over currently-APPROVED commissions,
// per affiliate, with a "Mark Paid" action for whichever affiliate's
// balance has crossed the configured minimum threshold. The admin pays
// the affiliate for real, off-platform, first — this page only records
// that it happened.

import { getAdminReferralPayoutOverview } from "../js/api/adminReferralsApi.js";
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
import { formatCurrency } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderGroupRow(group, minimumPayoutAmount) {
  const shortfall = Math.max(0, minimumPayoutAmount - group.approvedUnpaidBalance);
  return `
    <tr>
      <td>${escapeHtml(group.affiliateName)}</td>
      <td>${escapeHtml(group.affiliateReferralCode)}</td>
      <td>${group.commissionCount}</td>
      <td>${formatCurrency(group.approvedUnpaidBalance)}</td>
      <td>
        ${
          group.isPayoutEligible
            ? `<span class="admin-badge admin-badge--success">Eligible</span>`
            : `<span class="admin-badge admin-badge--neutral">Carrying forward (R${shortfall.toFixed(2)} short)</span>`
        }
      </td>
      <td class="admin-table__actions">
        ${
          group.isPayoutEligible
            ? `<button type="button" class="btn btn--primary btn--sm" data-action="pay-affiliate-commissions" data-affiliate-id="${escapeHtml(group.affiliateId)}" data-affiliate-name="${escapeHtml(group.affiliateName)}" data-balance="${group.approvedUnpaidBalance}">Mark Paid</button>`
            : "&mdash;"
        }
      </td>
    </tr>
  `;
}

export async function renderAdminReferralPayouts() {
  try {
    const response = await getAdminReferralPayoutOverview();
    const overview = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("payouts")}

        <h2 class="admin-page__section-title">Payouts</h2>
        <p class="admin-page__subtitle">
          Payout frequency: <strong>${escapeHtml(overview.payoutFrequency)}</strong>, target payout day: <strong>the ${overview.payoutDayOfMonth}${daySuffix(overview.payoutDayOfMonth)}</strong> of the following month.
          Minimum payout: <strong>${formatCurrency(overview.minimumPayoutAmount)}</strong>. A balance below this carries forward automatically — nothing earned is ever lost or expired.
        </p>
        <p class="admin-page__subtitle">
          Payment to an affiliate happens manually, off-platform (bank transfer, etc.). This page never sends money — it only records that a real payout already happened, once you mark it here.
        </p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div class="form-banner form-banner--error" data-admin-payout-banner hidden></div>

        ${
          overview.groups.length === 0
            ? `<p class="admin-empty">No approved, unpaid commissions right now.</p>`
            : `
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Affiliate</th>
                  <th>Code</th>
                  <th>Commissions</th>
                  <th>Approved Unpaid Balance</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${overview.groups.map((group) => renderGroupRow(group, overview.minimumPayoutAmount)).join("")}
              </tbody>
            </table>
          </div>
        `
        }
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

function daySuffix(day) {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
