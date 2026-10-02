// Milestone 199, Part 3: read-only CRM detail view for one outreach
// contact — organisation/buyer details, CRM status/follow-up/notes,
// and real campaign history (read straight from the existing
// OutreachCampaignRecipient relation via a dedicated history
// endpoint — never a second, duplicated history table). Separate from
// adminOutreachContactForm.js's full edit form: this page is the fast
// "understand this contact" view, with two focused quick-action forms
// (Lead Status, Next Follow-up) for the two fields a CRM user changes
// most often, plus a link to the full edit form for everything else.
// Neither quick action, nor anything else on this page, ever sends an
// email — both just PATCH the same contact record the full edit form
// already uses.

import { getAdminOutreachContactHistory } from "../js/api/adminOutreachContactApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting, consumePendingAdminMessage } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDate, formatDateTime, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";
import { ApiError } from "../js/apiClient.js";

const LEAD_STATUSES = ["PROSPECT", "CONTACTED", "INTERESTED", "CATALOGUE_SENT", "QUOTE_REQUESTED", "NEGOTIATING", "CUSTOMER", "REPEAT_CUSTOMER"];

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("outreach")}
      <h1 class="admin-page__title">Contact Not Found</h1>
      <p class="admin-page__subtitle">No contact found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/outreach/contacts">Back to Contacts</a>
    </section>
  `;
}

function renderDetailField(label, value) {
  return `
    <div class="admin-readonly-field">
      <span class="form-field__label">${escapeHtml(label)}</span>
      <span class="admin-readonly-value">${value}</span>
    </div>
  `;
}

function renderFollowUpValue(followUpState, nextFollowUpAt) {
  if (followUpState === "NONE") return "Not scheduled";
  const label = followUpState === "DUE_TODAY" ? "Due Today" : followUpState === "OVERDUE" ? "Overdue" : "Upcoming";
  const tone = followUpState === "OVERDUE" ? "admin-badge--danger" : followUpState === "DUE_TODAY" ? "admin-badge--neutral" : "admin-badge--success";
  return `<span class="admin-badge ${tone}">${label}</span> ${formatDate(nextFollowUpAt)}`;
}

// Part 3: "Do not label SENT as Delivered." — status is rendered
// exactly as the backend's own OutreachRecipientStatus word.
function renderHistoryTable(history) {
  if (history.length === 0) {
    return `<p class="admin-empty">No campaigns have been sent to this contact yet.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Subject</th>
            <th>Status</th>
            <th>Sent</th>
            <th>Failure Reason</th>
          </tr>
        </thead>
        <tbody>
          ${history
            .map(
              (entry) => `
            <tr>
              <td><a href="/admin/outreach/campaigns/${encodeURIComponent(entry.campaignId)}" class="admin-section__link">${escapeHtml(entry.campaignName)}</a></td>
              <td>${escapeHtml(entry.campaignSubject)}</td>
              <td>${renderStatusBadge(entry.status)}</td>
              <td>${entry.sentAt ? formatDateTime(entry.sentAt) : "&mdash;"}</td>
              <td>${entry.failureReason ? escapeHtml(entry.failureReason) : "&mdash;"}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderQuickLeadStatusForm(contact) {
  return `
    <form class="admin-quick-action-form" data-admin-outreach-quick-leadstatus-form data-contact-id="${escapeHtml(contact.id)}">
      <label class="form-field__label" for="quickLeadStatus">Change Lead Status</label>
      <div class="admin-quick-action-form__row">
        <select id="quickLeadStatus" class="form-field__input">
          ${LEAD_STATUSES.map((value) => `<option value="${value}"${value === contact.leadStatus ? " selected" : ""}>${humanizeEnum(value)}</option>`).join("")}
        </select>
        <button type="submit" class="btn btn--secondary btn--sm">Save</button>
      </div>
    </form>
  `;
}

function renderQuickFollowUpForm(contact) {
  return `
    <form class="admin-quick-action-form" data-admin-outreach-quick-followup-form data-contact-id="${escapeHtml(contact.id)}">
      <label class="form-field__label" for="quickNextFollowUp">Set / Update Follow-up</label>
      <div class="admin-quick-action-form__row">
        <input type="date" id="quickNextFollowUp" class="form-field__input" value="${contact.nextFollowUpAt ? contact.nextFollowUpAt.slice(0, 10) : ""}" />
        <button type="submit" class="btn btn--secondary btn--sm">Save</button>
      </div>
    </form>
  `;
}

export async function renderAdminOutreachContactDetail({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const response = await getAdminOutreachContactHistory(id);
    const { contact, history } = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("contacts")}
        <a class="admin-back-link" href="/admin/outreach/contacts">&larr; Back to Contacts</a>

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">${escapeHtml(contact.organisationName || contact.email)}</h2>
          <div class="admin-section__header-actions">
            <a class="btn btn--primary btn--sm" href="/admin/outreach/contacts/${encodeURIComponent(contact.id)}/edit">Edit Contact</a>
          </div>
        </div>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div data-admin-outreach-quick-action-banner class="form-banner form-banner--error" hidden></div>

        <h3 class="admin-page__section-title">Organisation Details</h3>
        <div class="admin-readonly-grid">
          ${renderDetailField("Organisation", escapeHtml(contact.organisationName || "(no organisation name)"))}
          ${renderDetailField("Business Type", contact.organisationType ? escapeHtml(contact.organisationType) : "&mdash;")}
          ${renderDetailField("Province", contact.province ? escapeHtml(contact.province) : "&mdash;")}
          ${renderDetailField("City / Town", contact.city ? escapeHtml(contact.city) : "&mdash;")}
          ${renderDetailField("Website", contact.website ? `<a href="${escapeHtml(contact.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(contact.website)}</a>` : "&mdash;")}
        </div>

        <h3 class="admin-page__section-title">Buyer / Contact Details</h3>
        <div class="admin-readonly-grid">
          ${renderDetailField("Contact Person", contact.contactName ? escapeHtml(contact.contactName) : "&mdash;")}
          ${renderDetailField("Role / Title", contact.contactRole ? escapeHtml(contact.contactRole) : "&mdash;")}
          ${renderDetailField("Campaign Email", escapeHtml(contact.email))}
          ${renderDetailField("Buyer Email", contact.buyerEmail ? escapeHtml(contact.buyerEmail) : "&mdash;")}
          ${renderDetailField("Phone", contact.phone ? escapeHtml(contact.phone) : "&mdash;")}
        </div>

        <h3 class="admin-page__section-title">CRM Status</h3>
        <div class="admin-readonly-grid">
          ${renderDetailField("Email Eligibility", renderStatusBadge(contact.status))}
          ${renderDetailField("Lead Status", renderStatusBadge(contact.leadStatus))}
          ${renderDetailField("Last Contacted", contact.lastContactedAt ? formatDate(contact.lastContactedAt) : "&mdash;")}
          ${renderDetailField("Next Follow-up", renderFollowUpValue(contact.followUpState, contact.nextFollowUpAt))}
        </div>

        <div class="admin-quick-actions">
          ${renderQuickLeadStatusForm(contact)}
          ${renderQuickFollowUpForm(contact)}
        </div>

        <h3 class="admin-page__section-title">Notes</h3>
        <p class="admin-page__subtitle">${contact.notes ? escapeHtml(contact.notes) : "No notes yet."}</p>

        <h3 class="admin-page__section-title">Campaign History</h3>
        ${renderHistoryTable(history)}
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    if (error instanceof ApiError && error.status === 404) {
      return renderNotFound(id);
    }
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}
