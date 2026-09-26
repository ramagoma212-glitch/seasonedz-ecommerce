// Milestone 198, Part 7: B2B outreach contact list — search/filter by
// organisation type, province, city, source, tag and status. Same
// admin-table/filter-bar shape as adminProducts.js. "Add Contact" and
// "Bulk Import" are the two ways new contacts enter the system (Part 5/6).

import { getAdminOutreachContacts, getAdminOutreachContactDistinctValues } from "../js/api/adminOutreachContactApi.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
  consumePendingAdminMessage,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDate, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function renderFilters(query, distinctValues) {
  const search = query.get("search") || "";
  const organisationType = query.get("organisationType") || "";
  const province = query.get("province") || "";
  const source = query.get("source") || "";
  const tag = query.get("tag") || "";

  const selectOptions = (values, current) => values.map((value) => `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");

  return `
    <form class="admin-product-filters" data-admin-outreach-contact-filter-form>
      <input type="search" name="search" placeholder="Search organisation, contact or email" value="${escapeHtml(search)}" class="form-field__input" />
      <select name="organisationType" class="form-field__input">
        <option value="">All organisation types</option>
        ${selectOptions(distinctValues.organisationTypes, organisationType)}
      </select>
      <select name="province" class="form-field__input">
        <option value="">All provinces</option>
        ${selectOptions(distinctValues.provinces, province)}
      </select>
      <select name="source" class="form-field__input">
        <option value="">All sources</option>
        ${selectOptions(distinctValues.sources, source)}
      </select>
      <select name="tag" class="form-field__input">
        <option value="">All tags</option>
        ${selectOptions(distinctValues.tags, tag)}
      </select>
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderContactsTable(contacts) {
  if (contacts.length === 0) {
    return `<p class="admin-empty">No contacts yet. Use "Add Contact" or "Bulk Import" to add the first one.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Organisation</th>
            <th>Contact</th>
            <th>Email</th>
            <th>Type</th>
            <th>Province</th>
            <th>Status</th>
            <th>Added</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${contacts
            .map(
              (contact) => `
            <tr data-contact-row="${escapeHtml(contact.id)}">
              <td>${escapeHtml(contact.organisationName || "(no organisation name)")}</td>
              <td>${escapeHtml(contact.contactName || "")}</td>
              <td>${escapeHtml(contact.email)}</td>
              <td>${escapeHtml(contact.organisationType || "")}</td>
              <td>${escapeHtml(contact.province || "")}</td>
              <td>${renderStatusBadge(contact.status)}</td>
              <td>${formatDate(contact.createdAt)}</td>
              <td class="admin-table__actions">
                <a href="/admin/outreach/contacts/${encodeURIComponent(contact.id)}/edit" class="admin-section__link">Edit</a>
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

function renderPagination(result, query) {
  if (result.totalPages <= 1) return "";

  const prevDisabled = result.page <= 1;
  const nextDisabled = result.page >= result.totalPages;

  function pageLink(page) {
    const params = new URLSearchParams(query);
    params.set("page", page);
    return `/admin/outreach/contacts?${params.toString()}`;
  }

  return `
    <div class="admin-pagination">
      ${prevDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Previous</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page - 1)}">Previous</a>`}
      <span class="admin-pagination__label">Page ${result.page} of ${result.totalPages}</span>
      ${nextDisabled ? `<span class="btn btn--secondary btn--sm is-disabled">Next</span>` : `<a class="btn btn--secondary btn--sm" href="${pageLink(result.page + 1)}">Next</a>`}
    </div>
  `;
}

export async function renderAdminOutreachContacts({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const page = Number(effectiveQuery.get("page")) || 1;
  const search = effectiveQuery.get("search") || undefined;
  const organisationType = effectiveQuery.get("organisationType") || undefined;
  const province = effectiveQuery.get("province") || undefined;
  const source = effectiveQuery.get("source") || undefined;
  const tag = effectiveQuery.get("tag") || undefined;

  try {
    const [contactsResponse, distinctValuesResponse] = await Promise.all([
      getAdminOutreachContacts({ page, search, organisationType, province, source, tag, status: "ACTIVE" }),
      getAdminOutreachContactDistinctValues(),
    ]);
    const result = contactsResponse.data;
    const distinctValues = distinctValuesResponse.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("contacts")}

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">Contacts</h2>
          <div class="admin-section__header-actions">
            <a class="btn btn--secondary btn--sm" href="/admin/outreach/contacts/import">Bulk Import</a>
            <a class="btn btn--primary btn--sm" href="/admin/outreach/contacts/new">Add Contact</a>
          </div>
        </div>
        <p class="admin-page__subtitle">${result.total} active contact${result.total === 1 ? "" : "s"} total</p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderFilters(effectiveQuery, distinctValues)}
        ${renderContactsTable(result.contacts)}
        ${renderPagination(result, effectiveQuery)}
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
