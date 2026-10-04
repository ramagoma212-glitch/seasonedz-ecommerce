// Milestone 201: create or edit a B2B quotation draft. Prices for each line
// are the admin's quote price, pre-filled from the product's current website
// price as a starting point only. Totals are calculated by the server on
// save, never previewed as authoritative here. Only drafts can be edited.

import { getAdminOutreachContacts } from "../js/api/adminOutreachContactApi.js";
import { getAdminQuotation } from "../js/api/adminOutreachCrmApi.js";
import { getAdminProducts } from "../js/api/adminDashboardApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting, consumePendingAdminMessage } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { escapeHtml } from "../js/search.js";
import { ApiError } from "../js/apiClient.js";

const LINE_ROWS = 15;

function todayIsoDate() {
  const sast = new Date(Date.now() + 2 * 60 * 60 * 1000);
  return sast.toISOString().slice(0, 10);
}

function plusDaysIsoDate(days) {
  const sast = new Date(Date.now() + 2 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000);
  return sast.toISOString().slice(0, 10);
}

function renderContactSelect(contacts, selectedId, locked) {
  if (locked) {
    const contact = contacts.find((item) => item.id === selectedId);
    const label = contact ? `${contact.organisationName || contact.email} (${contact.email})` : selectedId;
    return `<input type="hidden" name="contactId" value="${escapeHtml(selectedId)}" /><p class="admin-readonly-value">${escapeHtml(label)}</p>`;
  }
  return `
    <select name="contactId" required class="form-field__input">
      <option value="">Choose a contact</option>
      ${contacts
        .map((contact) => `<option value="${escapeHtml(contact.id)}"${contact.id === selectedId ? " selected" : ""}>${escapeHtml(contact.organisationName || contact.email)} (${escapeHtml(contact.email)})</option>`)
        .join("")}
    </select>
  `;
}

function renderLineRows(products, existingLines) {
  const rows = [];
  for (let index = 0; index < LINE_ROWS; index += 1) {
    const existing = existingLines[index];
    rows.push(`
      <tr>
        <td>
          <select name="line_productId" class="form-field__input">
            <option value="">&mdash; none &mdash;</option>
            ${products
              .map((product) => `<option value="${escapeHtml(product.id)}"${existing?.productId === product.id ? " selected" : ""}>${escapeHtml(product.name)}${product.sku ? ` (${escapeHtml(product.sku)})` : ""}</option>`)
              .join("")}
          </select>
        </td>
        <td><input type="number" name="line_quantity" min="1" step="1" class="form-field__input" value="${existing ? existing.quantity : ""}" /></td>
        <td><input type="text" inputmode="decimal" name="line_unitPrice" class="form-field__input" value="${existing ? escapeHtml(String(existing.unitPrice)) : ""}" placeholder="0.00" /></td>
      </tr>`);
  }
  return rows.join("");
}

export async function renderAdminOutreachQuotationCreate({ query } = {}) {
  return renderForm({ mode: "create", contactId: query?.get("contactId") ?? "" });
}

export async function renderAdminOutreachQuotationEdit({ id } = {}) {
  return renderForm({ mode: "edit", id });
}

async function renderForm({ mode, id, contactId }) {
  try {
    const quotation = mode === "edit" ? (await getAdminQuotation(id)).data : null;
    if (quotation && quotation.status !== "DRAFT") {
      return `
        <section class="container admin-page">
          ${renderAdminNav("outreach")}
          <h1 class="admin-page__title">Edit Quotation</h1>
          <div class="form-banner form-banner--error">${escapeHtml(quotation.quotationNumber)} has already been ${escapeHtml(quotation.status.toLowerCase())}, so it cannot be edited. Duplicate it to make a revised quotation.</div>
          <a class="btn btn--secondary" href="/admin/outreach/quotations/${encodeURIComponent(quotation.id)}">Back to quotation</a>
        </section>`;
    }

    const [contactsResponse, productsResponse] = await Promise.all([
      getAdminOutreachContacts({ limit: 100 }),
      getAdminProducts({ status: "ACTIVE", limit: 200 }),
    ]);
    const contacts = contactsResponse.data.contacts ?? contactsResponse.data.items ?? [];
    const products = productsResponse.data.products ?? [];
    const successMessage = consumePendingAdminMessage();

    const existingLines = quotation ? quotation.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, unitPrice: line.unitPrice })) : [];
    const selectedContactId = quotation?.contactId ?? contactId;
    const submitLabel = mode === "edit" ? "Save Draft" : "Create Draft";

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("quotations")}
        <a class="admin-back-link" href="${quotation ? `/admin/outreach/quotations/${encodeURIComponent(quotation.id)}` : "/admin/outreach/quotations"}">&larr; Back</a>
        <h2 class="admin-page__section-title">${mode === "edit" ? `Edit ${escapeHtml(quotation.quotationNumber)}` : "New Quotation"}</h2>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <div data-admin-quotation-form-banner class="form-banner form-banner--error" hidden></div>

        <form class="admin-form" data-admin-quotation-form data-mode="${mode}" data-quotation-id="${quotation ? escapeHtml(quotation.id) : ""}">
          <label class="form-field__label">Contact ${mode === "edit" ? "" : "(required)"}
            ${renderContactSelect(contacts, selectedContactId, mode === "edit")}
          </label>
          <div class="admin-readonly-grid">
            <label class="form-field__label">Quotation date
              <input type="date" name="quotationDate" class="form-field__input" value="${quotation ? quotation.quotationDate.slice(0, 10) : todayIsoDate()}" required />
            </label>
            <label class="form-field__label">Valid until
              <input type="date" name="validUntil" class="form-field__input" value="${quotation ? quotation.validUntil.slice(0, 10) : plusDaysIsoDate(30)}" required />
            </label>
          </div>

          <h3 class="admin-page__section-title">Products</h3>
          <p class="admin-page__subtitle">Enter the price you are quoting for each product. It can differ from the website price. Totals are calculated when you save.</p>
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead><tr><th>Product</th><th>Quantity</th><th>Quote unit price (R)</th></tr></thead>
              <tbody>${renderLineRows(products, existingLines)}</tbody>
            </table>
          </div>

          <div class="admin-readonly-grid">
            <label class="form-field__label">Discount (R, optional)
              <input type="text" inputmode="decimal" name="discount" class="form-field__input" value="${quotation ? escapeHtml(String(quotation.discountAmount)) : "0"}" />
            </label>
            <label class="form-field__label">Delivery (R, optional)
              <input type="text" inputmode="decimal" name="delivery" class="form-field__input" value="${quotation ? escapeHtml(String(quotation.deliveryAmount)) : "0"}" />
            </label>
          </div>
          <label class="form-field__label">Billing address (optional)
            <textarea name="billingAddress" rows="3" maxlength="2000" class="form-field__input">${quotation?.billingAddress ? escapeHtml(quotation.billingAddress) : ""}</textarea>
          </label>
          <label class="form-field__label">Notes shown on the quotation (optional)
            <textarea name="notes" rows="3" maxlength="2000" class="form-field__input">${quotation?.notes ? escapeHtml(quotation.notes) : ""}</textarea>
          </label>

          <div class="admin-form__actions">
            <button type="submit" class="btn btn--primary">${submitLabel}</button>
            <a class="btn btn--secondary" href="${quotation ? `/admin/outreach/quotations/${encodeURIComponent(quotation.id)}` : "/admin/outreach/quotations"}">Cancel</a>
          </div>
        </form>
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    if (error instanceof ApiError && error.status === 404) {
      return `<section class="container admin-page">${renderAdminNav("outreach")}<h1 class="admin-page__title">Quotation Not Found</h1><a class="btn btn--secondary" href="/admin/outreach/quotations">Back to Quotations</a></section>`;
    }
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}
