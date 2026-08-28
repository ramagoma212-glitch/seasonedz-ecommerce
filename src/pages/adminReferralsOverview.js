// Version 7, Milestone 172B.3: admin Referrals overview — structural
// summary values (affiliate counts by status, the programme's current
// default rates). Never fabricates clicks/orders/commission/sales
// figures, matching this project's own established "never invent
// business data" discipline.
//
// Version 7, Milestone 172B.5: real commission figures added alongside
// — every value is a genuine database aggregate (see
// referralCommission.service.ts's getCommissionOverviewStats()), never
// a fabricated one.

import { getReferralsOverview, getReferralSettings } from "../js/api/adminReferralsApi.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderReferralsSubNav } from "../components/referralsSubNav.js";
import { formatCurrency } from "../js/adminFormat.js";

function renderStatCard(label, value) {
  return `
    <div class="admin-card">
      <p class="admin-card__label">${label}</p>
      <p class="admin-card__value">${value}</p>
    </div>
  `;
}

export async function renderAdminReferralsOverview() {
  try {
    const [overviewResponse, settingsResponse] = await Promise.all([getReferralsOverview(), getReferralSettings()]);
    const overview = overviewResponse.data;
    const settings = settingsResponse.data;

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        <p class="admin-page__subtitle">Seasonedz's own affiliate and referral programme. Separate from the dormant external recommendations area.</p>
        ${renderReferralsSubNav("overview")}

        <h2 class="admin-page__section-title">Affiliates</h2>
        <div class="admin-cards">
          ${renderStatCard("Total", overview.totalAffiliates)}
          ${renderStatCard("Pending", overview.pendingAffiliates)}
          ${renderStatCard("Active", overview.activeAffiliates)}
          ${renderStatCard("Suspended", overview.suspendedAffiliates)}
          ${renderStatCard("Rejected", overview.rejectedAffiliates)}
        </div>

        <h2 class="admin-page__section-title">Current programme defaults</h2>
        <div class="admin-cards">
          ${renderStatCard("Commission rate", `${settings.defaultCommissionRate}%`)}
          ${renderStatCard("Referral discount", `${settings.defaultReferralDiscountRate}%`)}
          ${renderStatCard("Attribution window", `${settings.attributionWindowDays} days`)}
          ${renderStatCard("Validation period", `${settings.commissionValidationDays} days`)}
          ${renderStatCard("Minimum payout", formatCurrency(settings.minimumPayoutAmount))}
          ${renderStatCard("Payout day", `Day ${settings.payoutDayOfMonth}`)}
          ${renderStatCard("Programme status", settings.isProgrammeActive ? "Active" : "Inactive")}
        </div>
        <p class="admin-page__subtitle"><a href="/admin/referrals/settings">Change these defaults</a>.</p>

        <h2 class="admin-page__section-title">Commissions</h2>
        <div class="admin-cards">
          ${renderStatCard("Pending", overview.pendingCount)}
          ${renderStatCard("Pending value", formatCurrency(overview.pendingValue))}
          ${renderStatCard("Approved, unpaid", overview.approvedUnpaidCount)}
          ${renderStatCard("Approved, unpaid value", formatCurrency(overview.approvedUnpaidValue))}
          ${renderStatCard("Paid (lifetime)", formatCurrency(overview.paidValue))}
          ${renderStatCard("Reversed (lifetime)", formatCurrency(overview.reversedValue))}
          ${renderStatCard("Affiliates payout-eligible", overview.payoutEligibleAffiliateCount)}
        </div>
        <p class="admin-page__subtitle">
          <a href="/admin/referrals/commissions">Review commissions</a>. <a href="/admin/referrals/payouts">Manage payouts</a>.
        </p>
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
