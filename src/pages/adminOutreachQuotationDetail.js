// Milestone 201: one B2B quotation. The figures shown are exactly what the
// server stored when the quotation was created or last edited as a draft.
// Each action appears only when the quotation's status allows it, and every
// state change is an explicit button with its own confirmation in app.js.
// Sending requires the recipient address to be typed again.

import { getAdminQuotation, adminQuotationPdfUrl } from "../js/api/adminOutreachCrmApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting, consumePendingAdminMessage } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDate, formatDateTime, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";
import { ApiError } from "../js/apiClient.js";

function formatRandAmount(value) {
  return `R${Number(value).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderNotFound() {
  return `
    <section class="container admin-page">
      ${renderAdminNav("outreach")}
      <h1 class="admin-page__title">Quotation Not Found</h1>
      <a class="btn btn--secondary" href="/admin/outreach/quotations">Back to Quotations</a>
    </section>
  `;
}

function renderTotalsRow(label, value, bold = false) {
  return `<tr><th scope="row" class="${bold ? "admin-quote-total" : ""}">${escapeHtml(label)}</th><td class="${bold ? "admin-quote-total" : ""}">${escapeHtml(formatRandAmount(value))}</td></tr>`;
}

const UNRESOLVED = ["SENDING", "SEND_UNCERTAIN"];

function renderActions(quotation) {
  const id = escapeHtml(quotation.id);
  const actions = [];
  if (UNRESOLVED.includes(quotation.status)) {
    actions.push(`<a class="btn btn--secondary btn--sm" href="${adminQuotationPdfUrl(quotation.id)}" target="_blank" rel="noopener">Download PDF</a>`);
    return actions.join("");
  }
  if (quotation.status === "DRAFT") {
    actions.push(`<a class="btn btn--secondary btn--sm" href="/admin/outreach/quotations/${id}/edit">Edit Draft</a>`);
    actions.push(`<button type="button" class="btn btn--secondary btn--sm" data-quote-action="cancel" data-quote-id="${id}">Cancel Quotation</button>`);
  }
  if (quotation.status === "SENT") {
    actions.push(`<button type="button" class="btn btn--secondary btn--sm" data-quote-action="accept" data-quote-id="${id}">Mark Accepted</button>`);
    actions.push(`<button type="button" class="btn btn--secondary btn--sm" data-quote-action="decline" data-quote-id="${id}">Mark Declined</button>`);
    actions.push(`<button type="button" class="btn btn--secondary btn--sm" data-quote-action="expire" data-quote-id="${id}">Mark Expired</button>`);
    actions.push(`<button type="button" class="btn btn--secondary btn--sm" data-quote-action="cancel" data-quote-id="${id}">Withdraw Quotation</button>`);
  }
  actions.push(`<button type="button" class="btn btn--secondary btn--sm" data-quote-action="duplicate" data-quote-id="${id}">Duplicate as New Draft</button>`);
  actions.push(`<a class="btn btn--secondary btn--sm" href="${adminQuotationPdfUrl(quotation.id)}" target="_blank" rel="noopener">Download PDF</a>`);
  return actions.join("");
}

function renderUnresolvedPanel(quotation) {
  if (!UNRESOLVED.includes(quotation.status)) return "";
  const id = escapeHtml(quotation.id);
  return `
    <div class="form-banner form-banner--error" role="alert">
      <strong>${quotation.status === "SENDING" ? "This quotation is being sent, or the send was interrupted." : "The email provider did not confirm whether this quotation was delivered."}</strong>
      Do not resend it until you have checked the contact's mailbox, the email provider, and the sent folder.
      ${quotation.lastSendError ? `<br /><span class="admin-page__subtitle">Last recorded: ${escapeHtml(quotation.lastSendError)}</span>` : ""}
    </div>
    <form class="admin-quick-action-form" data-admin-quotation-reconcile-form data-quotation-id="${id}">
      <h3 class="admin-page__section-title">Confirm the outcome</h3>
      <p class="admin-page__subtitle">Only the owner (ADMIN) can record this. Write what you checked. The note stays in the timeline.</p>
      <label class="form-field__label">How you checked
        <textarea name="note" rows="2" maxlength="1000" required class="form-field__input"></textarea>
      </label>
      <button type="submit" name="outcome" value="SENT" class="btn btn--primary">It was delivered: mark as sent</button>
      <button type="submit" name="outcome" value="NOT_SENT" class="btn btn--secondary">It was not delivered: return to draft</button>
    </form>
  `;
}

function renderSendPanel(quotation) {
  if (quotation.status !== "DRAFT") return "";
  const contactActive = quotation.contact?.status === "ACTIVE";
  if (!contactActive) {
    return `
      <div class="form-banner form-banner--error">
        This contact&rsquo;s email status is ${escapeHtml(humanizeEnum(quotation.contact?.status ?? "UNKNOWN"))}, so this quotation cannot be emailed. Their email eligibility is unchanged.
      </div>`;
  }
  return `
    <form class="admin-quick-action-form" data-admin-quotation-send-form data-quotation-id="${escapeHtml(quotation.id)}">
      <h3 class="admin-page__section-title">Send by Email</h3>
      <p class="admin-page__subtitle">
        This emails the quotation summary to the contact. The PDF is not attached, because the email provider sends plain text only.
        Nothing is sent until you confirm, and the status changes only if the email is accepted for delivery.
      </p>
      <p><strong>Number:</strong> ${escapeHtml(quotation.quotationNumber)}<br /><strong>Recipient:</strong> ${escapeHtml(quotation.emailSnapshot)}</p>
      <label class="form-field__label">Type the recipient address to confirm
        <input type="email" name="confirmRecipientEmail" required autocomplete="off" class="form-field__input" />
      </label>
      <button type="submit" class="btn btn--primary">Send Quotation</button>
    </form>
  `;
}

export async function renderAdminOutreachQuotationDetail({ id } = {}) {
  if (!id) return renderNotFound();

  try {
    const response = await getAdminQuotation(id);
    const quotation = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("quotations")}
        <a class="admin-back-link" href="/admin/outreach/quotations">&larr; Back to Quotations</a>

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">${escapeHtml(quotation.quotationNumber)} ${renderStatusBadge(quotation.status)}</h2>
          <div class="admin-section__header-actions">${renderActions(quotation)}</div>
        </div>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div data-admin-quotation-action-banner class="form-banner form-banner--error" hidden></div>

        <div class="admin-readonly-grid">
          <div class="admin-readonly-field"><span class="form-field__label">Organisation</span><span class="admin-readonly-value">${escapeHtml(quotation.organisationNameSnapshot)}</span></div>
          <div class="admin-readonly-field"><span class="form-field__label">Contact person</span><span class="admin-readonly-value">${quotation.contactNameSnapshot ? escapeHtml(quotation.contactNameSnapshot) : "&mdash;"}</span></div>
          <div class="admin-readonly-field"><span class="form-field__label">Email</span><span class="admin-readonly-value">${escapeHtml(quotation.emailSnapshot)}</span></div>
          <div class="admin-readonly-field"><span class="form-field__label">Phone</span><span class="admin-readonly-value">${quotation.phoneSnapshot ? escapeHtml(quotation.phoneSnapshot) : "&mdash;"}</span></div>
          <div class="admin-readonly-field"><span class="form-field__label">Quotation date</span><span class="admin-readonly-value">${escapeHtml(formatDate(quotation.quotationDate))}</span></div>
          <div class="admin-readonly-field"><span class="form-field__label">Valid until</span><span class="admin-readonly-value">${escapeHtml(formatDate(quotation.validUntil))}</span></div>
          <div class="admin-readonly-field"><span class="form-field__label">Sent</span><span class="admin-readonly-value">${quotation.sentAt ? escapeHtml(formatDateTime(quotation.sentAt)) : "Not sent"}</span></div>
        </div>

        ${quotation.billingAddress ? `<h3 class="admin-page__section-title">Billing address</h3><p class="admin-page__subtitle">${escapeHtml(quotation.billingAddress)}</p>` : ""}

        <h3 class="admin-page__section-title">Items</h3>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>#</th><th>Description</th><th>SKU</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead>
            <tbody>
              ${quotation.lines
                .map(
                  (line) => `
                <tr>
                  <td>${line.position}</td>
                  <td>${escapeHtml(line.descriptionSnapshot)}</td>
                  <td>${line.skuSnapshot ? escapeHtml(line.skuSnapshot) : "&mdash;"}</td>
                  <td>${line.quantity}</td>
                  <td>${escapeHtml(formatRandAmount(line.unitPrice))}</td>
                  <td>${escapeHtml(formatRandAmount(line.lineTotal))}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <table class="admin-table admin-quote-totals">
          <tbody>
            ${renderTotalsRow("Subtotal", quotation.subtotal)}
            ${Number(quotation.discountAmount) > 0 ? renderTotalsRow("Discount", quotation.discountAmount) : ""}
            ${Number(quotation.deliveryAmount) > 0 ? renderTotalsRow("Delivery", quotation.deliveryAmount) : ""}
            ${renderTotalsRow("Total", quotation.total, true)}
          </tbody>
        </table>

        ${quotation.notes ? `<h3 class="admin-page__section-title">Notes</h3><p class="admin-page__subtitle">${escapeHtml(quotation.notes)}</p>` : ""}

        ${renderUnresolvedPanel(quotation)}
        ${renderSendPanel(quotation)}
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    if (error instanceof ApiError && error.status === 404) return renderNotFound();
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}
