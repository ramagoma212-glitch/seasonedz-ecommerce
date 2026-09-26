// Milestone 198, Part 8: B2B outreach campaign list. Same admin-table
// shape as adminCoupons.js. Also used as the "Sending History" view
// (via the historyOnly flag) — every non-draft campaign, so an admin
// can see what has actually gone out without a second table.

import { getAdminOutreachCampaigns } from "../js/api/adminOutreachCampaignApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting, consumePendingAdminMessage } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDateTime, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const NON_DRAFT_STATUSES = ["READY", "SENDING", "COMPLETED", "PARTIALLY_FAILED", "CANCELLED"];

function renderCampaignsTable(campaigns) {
  if (campaigns.length === 0) {
    return `<p class="admin-empty">No campaigns yet.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${campaigns
            .map(
              (campaign) => `
            <tr data-campaign-row="${escapeHtml(campaign.id)}">
              <td>${escapeHtml(campaign.name)}</td>
              <td>${escapeHtml(campaign.subject)}</td>
              <td>${renderStatusBadge(campaign.status)}</td>
              <td>${formatDateTime(campaign.createdAt)}</td>
              <td class="admin-table__actions">
                <a href="/admin/outreach/campaigns/${encodeURIComponent(campaign.id)}" class="admin-section__link">Open</a>
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

async function renderCampaignsList({ query, historyOnly, activeSubNavKey, title }) {
  const effectiveQuery = query || new URLSearchParams();
  const page = Number(effectiveQuery.get("page")) || 1;

  try {
    let campaigns;
    if (historyOnly) {
      const responses = await Promise.all(NON_DRAFT_STATUSES.map((status) => getAdminOutreachCampaigns({ status, limit: 100 })));
      campaigns = responses
        .flatMap((response) => response.data.campaigns)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else {
      const response = await getAdminOutreachCampaigns({ page });
      campaigns = response.data.campaigns;
    }
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav(activeSubNavKey)}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">${title}</h2>
          ${historyOnly ? "" : `<a class="btn btn--primary btn--sm" href="/admin/outreach/campaigns/new">New Campaign</a>`}
        </div>
        <p class="admin-page__subtitle">${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}</p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderCampaignsTable(campaigns)}
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

export async function renderAdminOutreachCampaigns({ query } = {}) {
  return renderCampaignsList({ query, historyOnly: false, activeSubNavKey: "campaigns", title: "Campaigns" });
}

export async function renderAdminOutreachHistory({ query } = {}) {
  return renderCampaignsList({ query, historyOnly: true, activeSubNavKey: "history", title: "Sending History" });
}
