// Milestone 201: admin B2B quotations list. Shows status counts, filters
// by status, and searches by quotation number, organisation or email. Every
// quotation is viewed on its own page; nothing here changes a quotation.

import { getAdminQuotations, getAdminQuotationSummary } from "../js/api/adminOutreachCrmApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting, consumePendingAdminMessage } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDate, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const STATUSES = ["DRAFT", "SENDING", "SEND_UNCERTAIN", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"];
const STATUS_LABELS = { SENDING: "Sending", SEND_UNCERTAIN: "Sending / uncertain" };

function statusLabel(status) {
  return STATUS_LABELS[status] ?? humanizeEnum(status);
}

function formatRandAmount(value) {
  return `R${Number(value).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderSummary(counts) {
  return `
    <div class="admin-cards">
      ${STATUSES.map((status) => `
        <a class="admin-card" href="/admin/outreach/quotations?status=${status}">
          <span class="admin-card__label">${escapeHtml(statusLabel(status))}</span>
          <span class="admin-card__value">${counts[status] ?? 0}</span>
        </a>`).join("")}
    </div>
  `;
}

function renderTable(result) {
  if (result.items.length === 0) {
    return `<p class="admin-empty">No quotations match these filters. Create one from a contact&rsquo;s page, or use New Quotation.</p>`;
  }
  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr><th>Number</th><th>Organisation</th><th>Status</th><th>Date</th><th>Valid Until</th><th>Total</th><th>Sent</th></tr>
        </thead>
        <tbody>
          ${result.items
            .map(
              (quote) => `
            <tr>
              <td><a class="admin-section__link" href="/admin/outreach/quotations/${encodeURIComponent(quote.id)}">${escapeHtml(quote.quotationNumber)}</a></td>
              <td>${escapeHtml(quote.organisationNameSnapshot)}</td>
              <td>${renderStatusBadge(quote.status)}</td>
              <td>${escapeHtml(formatDate(quote.quotationDate))}</td>
              <td>${escapeHtml(formatDate(quote.validUntil))}</td>
              <td>${escapeHtml(formatRandAmount(quote.total))}</td>
              <td>${quote.sentAt ? escapeHtml(formatDate(quote.sentAt)) : "&mdash;"}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminOutreachQuotations({ query } = {}) {
  const status = query?.get("status") && STATUSES.includes(query.get("status")) ? query.get("status") : "";
  const search = query?.get("search") ?? "";
  const page = Number.parseInt(query?.get("page") ?? "1", 10) || 1;

  try {
    const [listResponse, summaryResponse] = await Promise.all([
      getAdminQuotations({ status, search, page, limit: 25 }),
      getAdminQuotationSummary(),
    ]);
    const result = listResponse.data;
    const successMessage = consumePendingAdminMessage();
    const hasMore = result.page * result.limit < result.total;

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("quotations")}
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Quotations</h2>
          <div class="admin-section__header-actions">
            <a class="btn btn--primary btn--sm" href="/admin/outreach/quotations/new">New Quotation</a>
          </div>
        </div>

        ${renderSummary(summaryResponse.data)}

        <form class="admin-filter-form" method="get" action="/admin/outreach/quotations" data-admin-quotation-filter-form>
          <label class="form-field__label">Status
            <select name="status" class="form-field__input">
              <option value="">All statuses</option>
              ${STATUSES.map((value) => `<option value="${value}"${value === status ? " selected" : ""}>${escapeHtml(statusLabel(value))}</option>`).join("")}
            </select>
          </label>
          <label class="form-field__label">Search
            <input type="search" name="search" value="${escapeHtml(search)}" class="form-field__input" placeholder="Number, organisation or email" />
          </label>
          <button type="submit" class="btn btn--secondary btn--sm">Apply</button>
        </form>

        ${renderTable(result)}
        ${hasMore ? `<p><a class="btn btn--secondary btn--sm" href="/admin/outreach/quotations?${new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { search } : {}), page: String(page + 1) })}">Next page</a></p>` : ""}
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
