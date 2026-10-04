// Milestone 198, Part 7: B2B outreach contact list — search/filter by
// organisation type, province, city, source, tag and status. Same
// admin-table/filter-bar shape as adminProducts.js. "Add Contact" and
// "Bulk Import" are the two ways new contacts enter the system (Part 5/6).
//
// Milestone 199: upgraded into the main CRM working area — a factual
// counts summary at the top (never an invented conversion rate), plus
// Lead Status / Email Eligibility / Follow-up State filters and
// columns, alongside every filter/column this page already had. No
// new navigation item was added — this remains the existing Contacts
// page under the existing Outreach sub-nav, per the brief's own
// "upgrade, don't replace" instruction.

import { getAdminOutreachContacts, getAdminOutreachContactDistinctValues, getAdminOutreachCrmSummary } from "../js/api/adminOutreachContactApi.js";
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
import { formatDate, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const LEAD_STATUSES = ["PROSPECT", "CONTACTED", "INTERESTED", "CATALOGUE_SENT", "QUOTE_REQUESTED", "NEGOTIATING", "CUSTOMER", "REPEAT_CUSTOMER"];
const EMAIL_ELIGIBILITY_STATUSES = ["ACTIVE", "UNSUBSCRIBED", "BOUNCED", "INVALID", "SUPPRESSED"];
const FOLLOW_UP_STATES = [
  { value: "DUE_TODAY", label: "Due Today" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "UPCOMING", label: "Upcoming" },
  { value: "NONE", label: "No Follow-up Scheduled" },
];

// Milestone 199, Part H: every number here is a real count from
// getAdminOutreachCrmSummary() — never a derived/invented percentage.
function renderCrmSummary(summary) {
  const tiles = [
    ...LEAD_STATUSES.map((status) => ({ label: humanizeEnum(status), value: summary.byLeadStatus[status] ?? 0 })),
    { label: "Due Today", value: summary.dueToday, emphasis: summary.dueToday > 0 },
    { label: "Overdue", value: summary.overdue, emphasis: summary.overdue > 0 },
  ];

  return `
    <div class="admin-cards">
      ${tiles
        .map(
          (tile) => `
        <div class="admin-card${tile.emphasis ? " admin-card--warning" : ""}">
          <span class="admin-card__label">${escapeHtml(tile.label)}</span>
          <span class="admin-card__value">${tile.value}</span>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function renderFilters(query, distinctValues) {
  const search = query.get("search") || "";
  const organisationType = query.get("organisationType") || "";
  const province = query.get("province") || "";
  const source = query.get("source") || "";
  const tag = query.get("tag") || "";
  const leadStatus = query.get("leadStatus") || "";
  // Unlike every other filter above, "status" (email eligibility)
  // defaults to ACTIVE when absent, but must stay "" (All) when the
  // admin explicitly chose that option — `|| "ACTIVE"` alone would
  // wrongly collapse an explicit empty string back to ACTIVE on the
  // very next page load, fighting the admin's own choice.
  const statusParam = query.get("status");
  const status = statusParam === null ? "ACTIVE" : statusParam;
  const followUpState = query.get("followUpState") || "";

  const selectOptions = (values, current) => values.map((value) => `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${escapeHtml(value)}</option>`).join("");
  const enumOptions = (values, current, placeholder) =>
    `<option value="">${escapeHtml(placeholder)}</option>` +
    values.map((value) => `<option value="${escapeHtml(value)}"${value === current ? " selected" : ""}>${humanizeEnum(value)}</option>`).join("");

  return `
    <form class="admin-product-filters" data-admin-outreach-contact-filter-form>
      <input type="search" name="search" placeholder="Search organisation, contact or email" value="${escapeHtml(search)}" class="form-field__input" />
      <select name="organisationType" class="form-field__input">
        <option value="">All business types</option>
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
      <select name="leadStatus" class="form-field__input">
        ${enumOptions(LEAD_STATUSES, leadStatus, "All lead statuses")}
      </select>
      <select name="status" class="form-field__input">
        <option value="">All email eligibility</option>
        ${EMAIL_ELIGIBILITY_STATUSES.map((value) => `<option value="${value}"${value === status ? " selected" : ""}>${humanizeEnum(value)}</option>`).join("")}
      </select>
      <select name="followUpState" class="form-field__input">
        <option value="">All follow-up states</option>
        ${FOLLOW_UP_STATES.map((state) => `<option value="${state.value}"${state.value === followUpState ? " selected" : ""}>${escapeHtml(state.label)}</option>`).join("")}
      </select>
      <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
    </form>
  `;
}

function renderFollowUpBadge(followUpState, nextFollowUpAt) {
  if (followUpState === "NONE") return `<span class="admin-page__subtitle">&mdash;</span>`;
  const label = followUpState === "DUE_TODAY" ? "Due Today" : followUpState === "OVERDUE" ? "Overdue" : "Upcoming";
  const tone = followUpState === "OVERDUE" ? "admin-badge--danger" : followUpState === "DUE_TODAY" ? "admin-badge--neutral" : "admin-badge--success";
  return `<span class="admin-badge ${tone}">${label}</span> ${formatDate(nextFollowUpAt)}`;
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
            <th>Business Type</th>
            <th>Province</th>
            <th>Lead Status</th>
            <th>Email Eligibility</th>
            <th>Last Contacted</th>
            <th>Follow-up</th>
            <th>Next Action</th>
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
              <td>${renderStatusBadge(contact.leadStatus)}</td>
              <td>${renderStatusBadge(contact.status)}</td>
              <td>${contact.lastContactedAt ? formatDate(contact.lastContactedAt) : "&mdash;"}</td>
              <td>${renderFollowUpBadge(contact.followUpState, contact.nextFollowUpAt)}</td>
              <td>${contact.nextAction ? escapeHtml(contact.nextAction) : "&mdash;"}</td>
              <td>${formatDate(contact.createdAt)}</td>
              <td class="admin-table__actions">
                <a href="/admin/outreach/contacts/${encodeURIComponent(contact.id)}" class="admin-section__link">View</a>
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
  const leadStatus = effectiveQuery.get("leadStatus") || undefined;
  const followUpState = effectiveQuery.get("followUpState") || undefined;
  // Milestone 199: "status" (email eligibility) now defaults to ACTIVE
  // only when the admin hasn't explicitly chosen one — same "All ..."
  // empty-string-means-no-filter convention every other filter here
  // already uses, extended to a field that was previously hardcoded.
  const statusParam = effectiveQuery.get("status");
  const status = statusParam === "" ? undefined : statusParam || "ACTIVE";

  try {
    const [contactsResponse, distinctValuesResponse, crmSummaryResponse] = await Promise.all([
      getAdminOutreachContacts({ page, search, organisationType, province, source, tag, leadStatus, followUpState, status }),
      getAdminOutreachContactDistinctValues(),
      getAdminOutreachCrmSummary(),
    ]);
    const result = contactsResponse.data;
    const distinctValues = distinctValuesResponse.data;
    const crmSummary = crmSummaryResponse.data;
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
        ${renderCrmSummary(crmSummary)}
        <p class="admin-page__subtitle">${result.total} contact${result.total === 1 ? "" : "s"} matching current filters</p>
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
