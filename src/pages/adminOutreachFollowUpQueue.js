// Milestone 202: the Needs Follow-up queue. It lists only the contacts the rule
// in backend followUpRules.ts marks as due, with the reason for each. Nothing on
// this page sends an email. Each contact is opened one at a time to prepare an
// individual follow-up, so every send is a human decision.

import { getAdminFollowUpQueue } from "../js/api/adminOutreachCrmApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDate, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderRows(items) {
  if (items.length === 0) {
    return `<p class="admin-empty">Nobody needs a follow-up right now. Contacts appear here once their follow-up date passes, or once they have been quiet for seven days with no reply.</p>`;
  }
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>Organisation</th><th>Contact</th><th>Type</th><th>Lead</th><th>Last contacted</th><th>Why it is due</th><th>Earlier campaign</th><th></th></tr>
        </thead>
        <tbody>
          ${items
            .map(
              (item) => `
            <tr>
              <td>${escapeHtml(item.organisationName || item.email)}</td>
              <td>${escapeHtml(item.contactName || "")}</td>
              <td>${item.organisationType ? escapeHtml(item.organisationType) : "&mdash;"}</td>
              <td>${renderStatusBadge(item.leadStatus)} ${escapeHtml(humanizeEnum(item.leadStatus))}</td>
              <td>${item.lastContactedAt ? escapeHtml(formatDate(item.lastContactedAt)) : "&mdash;"}</td>
              <td>${escapeHtml(item.reason)}</td>
              <td>${item.latestCampaign ? escapeHtml(item.latestCampaign.name) : "&mdash;"}</td>
              <td><a class="btn btn--primary btn--sm" href="/admin/outreach/contacts/${encodeURIComponent(item.id)}/follow-up">Prepare follow-up</a></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminOutreachFollowUpQueue() {
  try {
    const queue = (await getAdminFollowUpQueue()).data;
    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("followups")}
        <h2 class="admin-page__section-title">Needs Follow-up</h2>
        <p class="admin-page__subtitle">
          Work through these one contact at a time. Opening a contact does not send anything. You review each message and press Send yourself.
        </p>
        <div class="admin-cards">
          <div class="admin-card"><span class="admin-card__label">Needs follow-up</span><span class="admin-card__value">${queue.counts.needsFollowUp}</span></div>
          <div class="admin-card"><span class="admin-card__label">Replied (respond, do not follow up)</span><span class="admin-card__value">${queue.counts.replied}</span></div>
          <div class="admin-card"><span class="admin-card__label">Scheduled for later</span><span class="admin-card__value">${queue.counts.scheduled}</span></div>
        </div>
        <p class="admin-page__subtitle">
          Rule: an ACTIVE contact in Contacted, Catalogue Sent, Interested, Quote Requested or Negotiating, with no reply since the last contact, no send in progress, and either a follow-up date that has passed or no date set and no contact in the last seven days.
        </p>
        ${renderRows(queue.items)}
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
