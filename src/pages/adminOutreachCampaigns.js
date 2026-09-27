// Milestone 198, Part 8 / Milestone 198.1: B2B outreach campaign list —
// search/browse, plus multi-select bulk sending. Same admin-table shape
// as adminCoupons.js. Also used as the "Sending History" view (via the
// historyOnly flag) — every non-draft campaign, so an admin can see what
// has actually gone out without a second table.
//
// Milestone 198.1: a checkbox per ELIGIBLE campaign (READY, or SENDING
// with recipients still PENDING — a genuinely "partway through, more to
// go" campaign is exactly the resumable-continuation case this bulk
// feature exists to make convenient; a campaign actively being touched
// by another request right now is a separate, transient concern the
// backend's own re-entrancy guard already handles, isolated per
// campaign — see outreachCampaign.service.ts's own comments).
// DRAFT/COMPLETED/CANCELLED campaigns never get a checkbox at all —
// there is nothing here for the owner to accidentally select.

import { getAdminOutreachCampaigns } from "../js/api/adminOutreachCampaignApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting, consumePendingAdminMessage } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDateTime, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const NON_DRAFT_STATUSES = ["READY", "SENDING", "COMPLETED", "PARTIALLY_FAILED", "CANCELLED"];

export function isCampaignEligibleForBulkSend(campaign) {
  return (campaign.status === "READY" || campaign.status === "SENDING") && (campaign.recipientCounts?.pending ?? 0) > 0;
}

function renderCampaignsTable(campaigns, showCheckboxes) {
  if (campaigns.length === 0) {
    return `<p class="admin-empty">No campaigns yet.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table" data-admin-outreach-campaigns-table>
        <thead>
          <tr>
            ${showCheckboxes ? `<th><input type="checkbox" data-outreach-select-all-ready aria-label="Select all eligible campaigns" /></th>` : ""}
            <th>Name</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Recipients</th>
            <th>Sent</th>
            <th>Failed</th>
            <th>Created</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${campaigns
            .map((campaign) => {
              const counts = campaign.recipientCounts || { total: 0, pending: 0, sent: 0, failed: 0 };
              const eligible = showCheckboxes && isCampaignEligibleForBulkSend(campaign);
              return `
            <tr data-campaign-row="${escapeHtml(campaign.id)}">
              ${
                showCheckboxes
                  ? `<td>${eligible ? `<input type="checkbox" data-outreach-campaign-checkbox value="${escapeHtml(campaign.id)}" />` : ""}</td>`
                  : ""
              }
              <td>${escapeHtml(campaign.name)}</td>
              <td>${escapeHtml(campaign.subject)}</td>
              <td>${renderStatusBadge(campaign.status)}</td>
              <td>${counts.pending} / ${counts.total}</td>
              <td>${counts.sent}</td>
              <td>${counts.failed}</td>
              <td>${formatDateTime(campaign.createdAt)}</td>
              <td class="admin-table__actions">
                <a href="/admin/outreach/campaigns/${encodeURIComponent(campaign.id)}" class="admin-section__link">Open</a>
              </td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderBulkActionBar() {
  return `
    <div class="form-banner form-banner--info" data-admin-outreach-bulk-bar hidden>
      <p data-admin-outreach-bulk-summary></p>
      <div class="admin-product-form__row">
        <button type="button" class="btn btn--secondary btn--sm" data-action="outreach-clear-selection">Clear Selection</button>
        <button type="button" class="btn btn--primary btn--sm" data-action="outreach-preview-bulk-send">Send Selected Campaigns</button>
      </div>
    </div>
    <div data-admin-outreach-bulk-confirm-section hidden>
      <h3 class="admin-page__section-title">Confirm Bulk Send</h3>
      <div class="admin-cards" data-admin-outreach-bulk-confirm-summary></div>
      <div data-admin-outreach-bulk-duplicates></div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Status</th>
              <th>Eligible Recipients</th>
            </tr>
          </thead>
          <tbody data-admin-outreach-bulk-confirm-rows></tbody>
        </table>
      </div>
      <p class="admin-page__subtitle" data-admin-outreach-bulk-confirm-statement></p>
      <div class="admin-product-form__row">
        <button type="button" class="btn btn--secondary btn--sm" data-action="outreach-cancel-bulk-confirm">Cancel</button>
        <button type="button" class="btn btn--primary" data-action="outreach-start-bulk-send" data-campaign-ids="">Start Campaigns</button>
      </div>
      <div class="form-banner form-banner--error" data-admin-outreach-bulk-banner hidden></div>
    </div>
    <div data-admin-outreach-bulk-progress-section hidden>
      <h3 class="admin-page__section-title">Sending Progress</h3>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Sent</th>
              <th>Pending</th>
              <th>Failed</th>
            </tr>
          </thead>
          <tbody data-admin-outreach-bulk-progress-rows></tbody>
        </table>
      </div>
      <p class="admin-page__subtitle" data-admin-outreach-bulk-progress-overall></p>
      <button type="button" class="btn btn--primary btn--sm" data-action="outreach-continue-bulk-send" data-campaign-ids="" hidden>Continue Sending</button>
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
        ${!historyOnly ? renderBulkActionBar() : ""}
        ${renderCampaignsTable(campaigns, !historyOnly)}
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
