// Version 7, Milestone 172B.3: admin Referrals overview — structural
// summary values only (affiliate counts by status, the programme's
// current default rates). Never fabricates clicks/orders/commission/
// sales figures — those stay honestly absent until real referred
// orders exist (172B.4+), matching this project's own established
// "never invent business data" discipline.

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
        <p class="admin-page__subtitle">Seasonedz's own affiliate/referral programme — separate from the dormant external recommendations area.</p>
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
        <p class="admin-page__subtitle">
          No referral discount or affiliate commission is live on the storefront yet — this foundation only manages
          affiliate applications and programme settings. <a href="/admin/referrals/settings">Change these defaults</a>.
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
