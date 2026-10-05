// Milestone 202: the individual follow-up composer for one CRM contact. Nothing
// here sends on load, on template change, or on preview. The owner writes or
// edits the message, previews the exact email (recipient, subject, body, signature
// and unsubscribe footer), types the recipient address, and presses Send. The
// idempotency key is generated per render, so a retry cannot send a second email.

import { getAdminFollowUpComposer, previewAdminFollowUp } from "../js/api/adminOutreachCrmApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting, consumePendingAdminMessage } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDate, formatDateTime, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";
import { ApiError } from "../js/apiClient.js";

function field(label, value) {
  return `
    <div class="admin-readonly-field">
      <span class="form-field__label">${escapeHtml(label)}</span>
      <span class="admin-readonly-value">${value}</span>
    </div>
  `;
}

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

function renderCampaignContext(latest) {
  if (!latest) return "No outreach campaign has been sent to this contact.";
  return `${escapeHtml(latest.name)}, subject &ldquo;${escapeHtml(latest.subject)}&rdquo;${latest.sentAt ? `, sent ${escapeHtml(formatDate(latest.sentAt))}` : ""}`;
}

function renderUnresolved(context, contactId) {
  if (!context.unresolvedAttemptId) return "";
  const attempt = context.attempts.find((item) => item.id === context.unresolvedAttemptId);
  return `
    <div class="form-banner form-banner--error" role="alert">
      <strong>An email to this contact has an unconfirmed outcome.</strong>
      The provider did not confirm whether it was delivered. Do not send again until you have checked the mailbox.
      ${attempt ? `<br /><span class="admin-page__subtitle">Subject: ${escapeHtml(attempt.subject)}</span>` : ""}
    </div>
    <form class="admin-quick-action-form" data-admin-followup-reconcile-form data-contact-id="${escapeHtml(contactId)}" data-attempt-id="${escapeHtml(context.unresolvedAttemptId)}">
      <p class="admin-page__subtitle">Only the owner (ADMIN) can record this. Write what you checked. The note stays in the timeline.</p>
      <label class="form-field__label">How you checked
        <textarea name="note" rows="2" maxlength="1000" required class="form-field__input"></textarea>
      </label>
      <button type="submit" name="outcome" value="SENT" class="btn btn--primary">It was delivered: record as sent</button>
      <button type="submit" name="outcome" value="NOT_SENT" class="btn btn--secondary">It was not delivered: release the lock</button>
    </form>
  `;
}

function renderAttempts(attempts) {
  if (attempts.length === 0) return `<p class="admin-empty">No follow-up emails from the CRM yet.</p>`;
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Prepared</th><th>Subject</th><th>Outcome</th><th>Notes</th></tr></thead>
        <tbody>
          ${attempts
            .map(
              (attempt) => `
            <tr>
              <td>${escapeHtml(formatDateTime(attempt.createdAt))}</td>
              <td>${escapeHtml(attempt.subject)}</td>
              <td>${renderStatusBadge(attempt.status)} ${escapeHtml(humanizeEnum(attempt.status))}</td>
              <td>${attempt.failureReason ? escapeHtml(attempt.failureReason) : attempt.reconciliationNote ? escapeHtml(attempt.reconciliationNote) : "&mdash;"}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminOutreachFollowUp({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const context = (await getAdminFollowUpComposer(id)).data;
    const initial = (await previewAdminFollowUp(id, { templateKey: context.suggestedTemplateKey })).data;
    const successMessage = consumePendingAdminMessage();
    const { contact, assessment } = context;
    const blocked = initial.blockedReasons.length > 0;
    const locked = Boolean(context.unresolvedAttemptId);
    const idempotencyKey = crypto.randomUUID();

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("contacts")}
        <a class="admin-back-link" href="/admin/outreach/contacts/${encodeURIComponent(contact.id)}">&larr; Back to contact</a>

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Follow-up for ${escapeHtml(contact.organisationName || contact.email)}</h2>
        </div>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div data-admin-followup-banner class="form-banner form-banner--error" hidden></div>
        ${renderUnresolved(context, contact.id)}
        ${blocked ? `<div class="form-banner form-banner--error">${escapeHtml(initial.blockedReasons.join(" "))} You can still review this page, but no email can be sent.</div>` : ""}

        <h3 class="admin-page__section-title">Context</h3>
        <div class="admin-readonly-grid">
          ${field("Organisation", escapeHtml(contact.organisationName || "(no organisation name)"))}
          ${field("Contact person", contact.contactName ? escapeHtml(contact.contactName) : "&mdash;")}
          ${field("Recipient", escapeHtml(contact.email))}
          ${field("Lead status", renderStatusBadge(contact.leadStatus))}
          ${field("Email eligibility", renderStatusBadge(contact.status))}
          ${field("Last contacted", contact.lastContactedAt ? escapeHtml(formatDate(contact.lastContactedAt)) : "&mdash;")}
          ${field("Next follow-up", contact.nextFollowUpAt ? escapeHtml(formatDate(contact.nextFollowUpAt)) : "Not set")}
          ${field("Next action", contact.nextAction ? escapeHtml(contact.nextAction) : "Not set")}
          ${field("Earlier campaign", renderCampaignContext(context.latestCampaign))}
          ${field("Queue status", escapeHtml(assessment.reason))}
        </div>

        <h3 class="admin-page__section-title">Compose</h3>
        <p class="admin-page__subtitle">
          The suggested message is a starting point. Edit it freely. The signature and the unsubscribe link are added automatically.
        </p>
        <form class="admin-form" data-admin-followup-send-form data-contact-id="${escapeHtml(contact.id)}" data-idempotency-key="${idempotencyKey}">
          <label class="form-field__label">Template
            <select name="templateKey" class="form-field__input" data-admin-followup-template-select data-contact-id="${escapeHtml(contact.id)}">
              ${initial.templates
                .map((group) => `<option value="${escapeHtml(group.key)}"${group.key === initial.templateKey ? " selected" : ""}>${escapeHtml(group.label)}</option>`)
                .join("")}
            </select>
          </label>
          <label class="form-field__label">Subject
            <input type="text" name="subject" maxlength="150" required class="form-field__input" value="${escapeHtml(initial.subject)}" />
          </label>
          <label class="form-field__label">Message
            <textarea name="body" rows="10" maxlength="4000" required class="form-field__input">${escapeHtml(initial.bodyText)}</textarea>
          </label>

          <div class="admin-form__actions">
            <button type="button" class="btn btn--secondary" data-admin-followup-action="preview" data-contact-id="${escapeHtml(contact.id)}">Preview exact email</button>
          </div>
          <div data-admin-followup-preview hidden></div>

          <h3 class="admin-page__section-title">Send</h3>
          <p class="admin-page__subtitle">Nothing is sent until you type the address below and confirm. Each click sends at most one email.</p>
          <label class="form-field__label">Type the recipient address to confirm
            <input type="email" name="confirmRecipientEmail" required autocomplete="off" class="form-field__input" ${blocked || locked ? "disabled" : ""} />
          </label>
          <button type="submit" class="btn btn--primary" ${blocked || locked ? "disabled" : ""}>Send follow-up email</button>
        </form>

        <h3 class="admin-page__section-title">Follow-up history</h3>
        ${renderAttempts(context.attempts)}
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    if (error instanceof ApiError && error.status === 404) return renderNotFound(id);
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}
