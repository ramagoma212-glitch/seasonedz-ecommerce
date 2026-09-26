// Milestone 198, Part 14/15/18/19: the campaign detail page — recipient
// counts, Send Test, the confirmed bulk-send action, Continue Sending
// (the resumable batch model — see outreachCampaign.service.ts's own
// header comment on why no queue exists to lean on), Retry Failed,
// Cancel, and a paginated recipient-status table.

import { getAdminOutreachCampaign, getAdminOutreachCampaignRecipients } from "../js/api/adminOutreachCampaignApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting, consumePendingAdminMessage } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDateTime, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("outreach")}
      <h1 class="admin-page__title">Campaign Not Found</h1>
      <p class="admin-page__subtitle">No campaign found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/outreach/campaigns">Back to Campaigns</a>
    </section>
  `;
}

function renderRecipientCounts(counts) {
  function statCard(label, value) {
    return `<div class="admin-card"><p class="admin-card__label">${label}</p><p class="admin-card__value">${value}</p></div>`;
  }
  return `
    <div class="admin-cards">
      ${statCard("Total Recipients", counts.total)}
      ${statCard("Pending", counts.pending)}
      ${statCard("Sent", counts.sent)}
      ${statCard("Failed", counts.failed)}
      ${statCard("Suppressed", counts.suppressed)}
      ${statCard("Invalid", counts.invalid)}
    </div>
  `;
}

function renderSendControls(campaign, counts) {
  if (campaign.status === "DRAFT") {
    return `<p class="admin-page__subtitle">Build the recipient list on the <a href="/admin/outreach/campaigns/${encodeURIComponent(campaign.id)}/edit">edit page</a> before sending.</p>`;
  }
  if (campaign.status === "CANCELLED") {
    return `<p class="admin-page__subtitle">This campaign was cancelled.</p>`;
  }

  const buttons = [];
  if (counts.pending > 0) {
    // Part 15: the button's own label states the exact count about to
    // be sent in THIS batch — never a vague "Send".
    buttons.push(`<button type="button" class="btn btn--primary" data-action="outreach-send-batch" data-campaign-id="${escapeHtml(campaign.id)}">Send Next ${Math.min(counts.pending, 20)} of ${counts.pending} Remaining</button>`);
  }
  if (counts.failed > 0) {
    buttons.push(`<button type="button" class="btn btn--secondary" data-action="outreach-retry-failed" data-campaign-id="${escapeHtml(campaign.id)}">Retry ${counts.failed} Failed</button>`);
  }
  if (campaign.status !== "COMPLETED") {
    buttons.push(`<button type="button" class="btn btn--danger" data-action="outreach-cancel-campaign" data-campaign-id="${escapeHtml(campaign.id)}">Cancel Campaign</button>`);
  }

  return `
    <div class="admin-product-form__row">${buttons.join("")}</div>
    <div class="form-banner form-banner--error" data-admin-outreach-send-banner hidden></div>
  `;
}

function renderTestSendForm(campaignId) {
  return `
    <form class="admin-product-form" data-admin-outreach-test-send-form data-campaign-id="${escapeHtml(campaignId)}" novalidate>
      <div class="form-field">
        <label class="form-field__label" for="outreachTestEmailAddress">Send Test To <span class="form-field__required">*</span></label>
        <input type="email" id="outreachTestEmailAddress" class="form-field__input" required placeholder="you@seasonedzgroup.co.za" />
      </div>
      <button type="submit" class="btn btn--secondary">Send Test</button>
      <p class="admin-product-form__hint">Sent only to this one address — never counted as a campaign recipient.</p>
      <div class="form-banner form-banner--error" data-admin-outreach-test-send-banner hidden></div>
      <div class="form-banner form-banner--success" data-admin-outreach-test-send-success hidden></div>
    </form>
  `;
}

function renderRecipientsTable(result) {
  if (result.recipients.length === 0) {
    return `<p class="admin-empty">No recipients yet.</p>`;
  }
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Organisation</th>
            <th>Email</th>
            <th>Status</th>
            <th>Sent</th>
            <th>Failure Reason</th>
          </tr>
        </thead>
        <tbody>
          ${result.recipients
            .map(
              (recipient) => `
            <tr>
              <td>${escapeHtml(recipient.organisationNameSnapshot || "")}</td>
              <td>${escapeHtml(recipient.emailSnapshot)}</td>
              <td>${renderStatusBadge(recipient.status)}</td>
              <td>${recipient.sentAt ? formatDateTime(recipient.sentAt) : ""}</td>
              <td>${escapeHtml(recipient.failureReason || "")}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminOutreachCampaignDetail({ id, query } = {}) {
  if (!id) return renderNotFound("");
  const effectiveQuery = query || new URLSearchParams();
  const page = Number(effectiveQuery.get("page")) || 1;

  try {
    const [campaignResponse, recipientsResponse] = await Promise.all([getAdminOutreachCampaign(id), getAdminOutreachCampaignRecipients(id, { page })]);
    const campaign = campaignResponse.data;
    const recipients = recipientsResponse.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("campaigns")}
        <a class="admin-back-link" href="/admin/outreach/campaigns">&larr; Back to Campaigns</a>

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">${escapeHtml(campaign.name)}</h2>
          <div class="admin-section__header-actions">
            ${renderStatusBadge(campaign.status)}
            ${!campaign.sendStartedAt ? `<a class="btn btn--secondary btn--sm" href="/admin/outreach/campaigns/${encodeURIComponent(id)}/edit">Edit</a>` : ""}
          </div>
        </div>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}

        <div class="admin-readonly-field">
          <span class="form-field__label">Subject</span>
          <span class="admin-readonly-value">${escapeHtml(campaign.subject)}</span>
        </div>

        ${renderRecipientCounts(campaign.recipientCounts)}
        ${renderSendControls(campaign, campaign.recipientCounts)}

        <h3 class="admin-page__section-title">Send Test</h3>
        ${renderTestSendForm(id)}

        <h3 class="admin-page__section-title">Recipients</h3>
        ${renderRecipientsTable(recipients)}
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
