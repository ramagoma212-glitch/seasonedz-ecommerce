// Milestone 199 introduced this read-only CRM view; Milestone 201 makes it
// the central sales view for one contact: next action and follow-up, the
// chronological timeline, quotations, linked orders, and read-only enquiries.
// Every action on this page is explicit. Recording a reply, call, note or
// catalogue send never changes the lead status, and nothing on this page
// changes email eligibility or sends an email. Quick actions are collapsed
// <details> forms so the page stays readable.

import { getAdminOutreachContactHistory } from "../js/api/adminOutreachContactApi.js";
import { getAdminOutreachCrmDetail } from "../js/api/adminOutreachCrmApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting, consumePendingAdminMessage } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDate, formatDateTime, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";
import { ApiError } from "../js/apiClient.js";

const LEAD_STATUSES = ["PROSPECT", "CONTACTED", "INTERESTED", "CATALOGUE_SENT", "QUOTE_REQUESTED", "NEGOTIATING", "CUSTOMER", "REPEAT_CUSTOMER"];
const CHANNEL_LABELS = { EMAIL: "Email", PHONE: "Phone", WHATSAPP: "WhatsApp", OTHER: "Other" };

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

function renderField(label, value) {
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

function channelOptions(selected, values) {
  return values.map((value) => `<option value="${value}"${value === selected ? " selected" : ""}>${CHANNEL_LABELS[value]}</option>`).join("");
}

function renderTimelineEntry(entry) {
  const when = formatDateTime(entry.occurredAt);
  const kind = entry.kind === "campaign" ? "Campaign" : humanizeEnum(entry.type);
  const channel = entry.channel ? ` &middot; ${CHANNEL_LABELS[entry.channel] ?? escapeHtml(entry.channel)}` : "";
  const by = entry.createdByAdminNameSnapshot ? ` &middot; by ${escapeHtml(entry.createdByAdminNameSnapshot)}` : "";
  const quoteLink = entry.quotationId ? ` <a class="admin-section__link" href="/admin/outreach/quotations/${encodeURIComponent(entry.quotationId)}">Open quotation</a>` : "";
  return `
    <li class="admin-timeline__item">
      <div class="admin-timeline__meta">${escapeHtml(when)} &middot; <strong>${escapeHtml(kind)}</strong>${channel}${by}</div>
      <div class="admin-timeline__title">${escapeHtml(entry.title)}${quoteLink}</div>
      ${entry.details ? `<div class="admin-timeline__details">${escapeHtml(entry.details)}</div>` : ""}
    </li>
  `;
}

function renderTimeline(timeline) {
  if (timeline.length === 0) return `<p class="admin-empty">Nothing recorded yet. Use the actions above to log replies, calls and follow-ups.</p>`;
  return `<ol class="admin-timeline">${timeline.map(renderTimelineEntry).join("")}</ol>`;
}

function renderQuotations(quotations, contactId) {
  const rows = quotations.length
    ? quotations
        .map(
          (quote) => `
          <tr>
            <td><a class="admin-section__link" href="/admin/outreach/quotations/${encodeURIComponent(quote.id)}">${escapeHtml(quote.quotationNumber)}</a></td>
            <td>${renderStatusBadge(quote.status)}</td>
            <td>${escapeHtml(formatDate(quote.quotationDate))}</td>
            <td>${escapeHtml(formatDate(quote.validUntil))}</td>
            <td>R${escapeHtml(Number(quote.total).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5" class="admin-empty">No quotations for this contact yet.</td></tr>`;

  return `
    <div class="admin-section__header-actions">
      <a class="btn btn--primary btn--sm" href="/admin/outreach/quotations/new?contactId=${encodeURIComponent(contactId)}">Create Quote</a>
    </div>
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Number</th><th>Status</th><th>Date</th><th>Valid Until</th><th>Total</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderLinkedOrders(linkedOrders, timeline, contact) {
  const linkedIds = new Set(timeline.filter((entry) => entry.type === "ORDER_CREATED" && entry.orderId).map((entry) => entry.orderId));
  const customerConverted = contact.leadStatus === "CUSTOMER" || contact.leadStatus === "REPEAT_CUSTOMER";
  if (linkedOrders.length === 0) {
    return `<p class="admin-empty">No orders use this contact's email address. Orders are matched only by exact email, never by name.</p>`;
  }
  const rows = linkedOrders
    .map((order) => {
      const linked = linkedIds.has(order.id);
      return `
        <tr>
          <td><a class="admin-section__link" href="/admin/orders/${encodeURIComponent(order.id)}">${escapeHtml(order.orderNumber)}</a></td>
          <td>${escapeHtml(formatDate(order.createdAt))}</td>
          <td>${renderStatusBadge(order.status)}</td>
          <td>R${escapeHtml(Number(order.total).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}</td>
          <td class="admin-crm-order-actions">
            ${linked ? "Linked" : `<button type="button" class="btn btn--secondary btn--sm" data-crm-order-action="link" data-order-id="${escapeHtml(order.id)}">Link to contact</button>`}
            ${!customerConverted ? `<button type="button" class="btn btn--secondary btn--sm" data-crm-order-action="mark-customer" data-order-id="${escapeHtml(order.id)}">Mark as customer</button>` : ""}
          </td>
        </tr>`;
    })
    .join("");
  const repeatButton =
    customerConverted && linkedOrders.length >= 2 && contact.leadStatus !== "REPEAT_CUSTOMER"
      ? `<button type="button" class="btn btn--secondary btn--sm" data-crm-order-action="mark-repeat">Mark as repeat customer</button>`
      : "";
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Total</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${repeatButton}
  `;
}

function renderEnquiries(enquiries) {
  if (enquiries.length === 0) return `<p class="admin-empty">No enquiries use this email address.</p>`;
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr><th>Received</th><th>Type</th><th>Status</th><th>Subject</th></tr></thead>
        <tbody>
          ${enquiries
            .map((enquiry) => `<tr><td>${escapeHtml(formatDate(enquiry.createdAt))}</td><td>${escapeHtml(humanizeEnum(enquiry.type))}</td><td>${renderStatusBadge(enquiry.status)}</td><td>${escapeHtml(enquiry.subject || "(no subject)")}</td></tr>`)
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderQuickActions(contact) {
  const id = escapeHtml(contact.id);
  return `
    <div class="admin-quick-actions" data-crm-quick-actions data-contact-id="${id}">
      <a class="btn btn--primary btn--sm" href="/admin/outreach/contacts/${id}/follow-up">Send Follow-up</a>
      <details class="admin-crm-action" open>
        <summary>Record Reply</summary>
        <p class="admin-page__subtitle">Records what the contact said. It does not change the lead status: use Lead Status below if that should change.</p>
        <form class="admin-quick-action-form" data-admin-crm-form data-crm-action="activity" data-contact-id="${id}" data-activity-type="REPLY_RECEIVED">
          <label class="form-field__label">How it arrived<select name="channel" class="form-field__input">${channelOptions("EMAIL", ["EMAIL", "PHONE", "WHATSAPP", "OTHER"])}</select></label>
          <label class="form-field__label">When<input type="datetime-local" name="occurredAt" class="form-field__input" /></label>
          <label class="form-field__label">Summary<input type="text" name="title" maxlength="150" required class="form-field__input" placeholder="e.g. Asked for a catalogue" /></label>
          <label class="form-field__label">Notes<textarea name="details" rows="2" maxlength="5000" class="form-field__input"></textarea></label>
          <button type="submit" class="btn btn--primary btn--sm">Save Reply</button>
        </form>
      </details>

      <details class="admin-crm-action">
        <summary>Add Note</summary>
        <form class="admin-quick-action-form" data-admin-crm-form data-crm-action="activity" data-contact-id="${id}" data-activity-type="NOTE">
          <label class="form-field__label">Note<textarea name="details" rows="3" maxlength="5000" required class="form-field__input"></textarea></label>
          <button type="submit" class="btn btn--secondary btn--sm">Save Note</button>
        </form>
      </details>

      <details class="admin-crm-action">
        <summary>Record Call</summary>
        <form class="admin-quick-action-form" data-admin-crm-form data-crm-action="activity" data-contact-id="${id}" data-activity-type="PHONE_CALL">
          <label class="form-field__label">When<input type="datetime-local" name="occurredAt" class="form-field__input" /></label>
          <label class="form-field__label">Notes<textarea name="details" rows="2" maxlength="5000" class="form-field__input"></textarea></label>
          <button type="submit" class="btn btn--secondary btn--sm">Save Call</button>
        </form>
      </details>

      <details class="admin-crm-action">
        <summary>Record WhatsApp</summary>
        <form class="admin-quick-action-form" data-admin-crm-form data-crm-action="activity" data-contact-id="${id}" data-activity-type="WHATSAPP">
          <label class="form-field__label">When<input type="datetime-local" name="occurredAt" class="form-field__input" /></label>
          <label class="form-field__label">Notes<textarea name="details" rows="2" maxlength="5000" class="form-field__input"></textarea></label>
          <button type="submit" class="btn btn--secondary btn--sm">Save WhatsApp</button>
        </form>
      </details>

      <details class="admin-crm-action">
        <summary>Record Catalogue Sent</summary>
        <p class="admin-page__subtitle">Records that you sent the catalogue. It does not change the lead status.</p>
        <form class="admin-quick-action-form" data-admin-crm-form data-crm-action="catalogue" data-contact-id="${id}">
          <label class="form-field__label">Sent by<select name="channel" class="form-field__input">${channelOptions("EMAIL", ["EMAIL", "WHATSAPP", "OTHER"])}</select></label>
          <label class="form-field__label">When<input type="datetime-local" name="occurredAt" class="form-field__input" /></label>
          <label class="form-field__label">Notes<textarea name="details" rows="2" maxlength="5000" class="form-field__input"></textarea></label>
          <button type="submit" class="btn btn--secondary btn--sm">Save Catalogue Sent</button>
        </form>
      </details>

      <details class="admin-crm-action">
        <summary>Set Follow-up</summary>
        <form class="admin-quick-action-form" data-admin-crm-form data-crm-action="follow-up" data-contact-id="${id}">
          <label class="form-field__label">Follow-up date<input type="date" name="nextFollowUpAt" class="form-field__input" value="${contact.nextFollowUpAt ? contact.nextFollowUpAt.slice(0, 10) : ""}" /></label>
          <label class="form-field__label">Next action<input type="text" name="nextAction" maxlength="200" class="form-field__input" value="${escapeHtml(contact.nextAction || "")}" placeholder="e.g. Call principal" /></label>
          <button type="submit" class="btn btn--secondary btn--sm">Save Follow-up</button>
          <button type="button" class="btn btn--secondary btn--sm" data-crm-action="clear-follow-up">Clear Follow-up</button>
        </form>
      </details>

      <details class="admin-crm-action">
        <summary>Mark Follow-up Completed</summary>
        <form class="admin-quick-action-form" data-admin-crm-form data-crm-action="complete-follow-up" data-contact-id="${id}">
          <label class="form-field__label">What happened<textarea name="details" rows="2" maxlength="5000" class="form-field__input"></textarea></label>
          <label class="form-field__label">Next follow-up date (optional)<input type="date" name="nextFollowUpAt" class="form-field__input" /></label>
          <label class="form-field__label">Next action (optional)<input type="text" name="nextAction" maxlength="200" class="form-field__input" /></label>
          <button type="submit" class="btn btn--primary btn--sm">Mark Completed</button>
        </form>
      </details>

      <form class="admin-quick-action-form" data-admin-outreach-quick-leadstatus-form data-contact-id="${id}">
        <label class="form-field__label" for="quickLeadStatus">Lead Status</label>
        <div class="admin-quick-action-form__row">
          <select id="quickLeadStatus" class="form-field__input">
            ${LEAD_STATUSES.map((value) => `<option value="${value}"${value === contact.leadStatus ? " selected" : ""}>${humanizeEnum(value)}</option>`).join("")}
          </select>
          <button type="submit" class="btn btn--secondary btn--sm">Save Lead Status</button>
        </div>
      </form>
    </div>
  `;
}

export async function renderAdminOutreachContactDetail({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const [historyResponse, crmResponse] = await Promise.all([getAdminOutreachContactHistory(id), getAdminOutreachCrmDetail(id)]);
    const { contact, history } = historyResponse.data;
    const crm = crmResponse.data;
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
            <a class="btn btn--secondary btn--sm" href="/admin/outreach/contacts/${encodeURIComponent(contact.id)}/edit">Edit Contact</a>
          </div>
        </div>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div data-admin-outreach-quick-action-banner class="form-banner form-banner--error" hidden></div>

        <div class="admin-crm-next-action">
          <strong>Next action:</strong> ${contact.nextAction ? escapeHtml(contact.nextAction) : "<span class=\"admin-page__subtitle\">None set</span>"}
          &middot; <strong>Follow-up:</strong> ${renderFollowUpValue(contact.followUpState, contact.nextFollowUpAt)}
        </div>

        <h3 class="admin-page__section-title">Organisation and Contact</h3>
        <div class="admin-readonly-grid">
          ${renderField("Organisation", escapeHtml(contact.organisationName || "(no organisation name)"))}
          ${renderField("Business Type", contact.organisationType ? escapeHtml(contact.organisationType) : "&mdash;")}
          ${renderField("Province", contact.province ? escapeHtml(contact.province) : "&mdash;")}
          ${renderField("City / Town", contact.city ? escapeHtml(contact.city) : "&mdash;")}
          ${renderField("Contact Person", contact.contactName ? escapeHtml(contact.contactName) : "&mdash;")}
          ${renderField("Role / Title", contact.contactRole ? escapeHtml(contact.contactRole) : "&mdash;")}
          ${renderField("Campaign Email", escapeHtml(contact.email))}
          ${renderField("Buyer Email", contact.buyerEmail ? escapeHtml(contact.buyerEmail) : "&mdash;")}
          ${renderField("Phone", contact.phone ? escapeHtml(contact.phone) : "&mdash;")}
          ${renderField("Website", contact.website ? `<a href="${escapeHtml(contact.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(contact.website)}</a>` : "&mdash;")}
        </div>

        <h3 class="admin-page__section-title">Sales Status</h3>
        <div class="admin-readonly-grid">
          ${renderField("Email Eligibility", renderStatusBadge(contact.status))}
          ${renderField("Lead Status", renderStatusBadge(contact.leadStatus))}
          ${renderField("Last Contacted", contact.lastContactedAt ? formatDate(contact.lastContactedAt) : "&mdash;")}
          ${renderField("Last Catalogue Sent", contact.lastCatalogueSentAt ? formatDate(contact.lastCatalogueSentAt) : "&mdash;")}
        </div>
        <p class="admin-page__subtitle">Email eligibility controls marketing sends only. Lead status and quotations never change it.</p>

        <h3 class="admin-page__section-title">Quick Actions</h3>
        ${renderQuickActions(contact)}

        <h3 class="admin-page__section-title">Notes</h3>
        <p class="admin-page__subtitle">${contact.notes ? escapeHtml(contact.notes) : "No notes yet."}</p>

        <h3 class="admin-page__section-title">CRM Timeline</h3>
        ${renderTimeline(crm.timeline)}

        <h3 class="admin-page__section-title">Quotations</h3>
        ${renderQuotations(crm.quotations, contact.id)}

        <h3 class="admin-page__section-title">Linked Orders</h3>
        ${renderLinkedOrders(crm.linkedOrders, crm.timeline, contact)}

        <h3 class="admin-page__section-title">Enquiries (same email address)</h3>
        ${renderEnquiries(crm.enquiries)}

        <h3 class="admin-page__section-title">Campaign History</h3>
        ${
          history.length === 0
            ? `<p class="admin-empty">No campaigns have been sent to this contact yet.</p>`
            : `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Campaign</th><th>Subject</th><th>Status</th><th>Sent</th></tr></thead><tbody>${history
                .map((entry) => `<tr><td>${escapeHtml(entry.campaignName)}</td><td>${escapeHtml(entry.campaignSubject)}</td><td>${renderStatusBadge(entry.status)}</td><td>${entry.sentAt ? formatDateTime(entry.sentAt) : "&mdash;"}</td></tr>`)
                .join("")}</tbody></table></div>`
        }
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

