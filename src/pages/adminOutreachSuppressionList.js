// Milestone 198, Part 2/12: the Suppression List admin page — every
// contact NOT currently ACTIVE (unsubscribed, bounced, invalid, or
// manually suppressed). Deliberately a filtered view of the same
// OutreachContact table rather than a separate table, so a contact's
// suppression state can never desync between two places that both
// claim to know it (see schema.prisma's own comment on
// OutreachContact.status).

import { getAdminOutreachContacts } from "../js/api/adminOutreachContactApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting, consumePendingAdminMessage } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { formatDate, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const SUPPRESSED_STATUSES = ["UNSUBSCRIBED", "BOUNCED", "INVALID", "SUPPRESSED"];

function renderSuppressionTable(contacts) {
  if (contacts.length === 0) {
    return `<p class="admin-empty">No suppressed contacts. Every contact is currently active.</p>`;
  }

  return `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th>Organisation</th>
            <th>Email</th>
            <th>Status</th>
            <th>Reason</th>
            <th>Suppressed</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${contacts
            .map(
              (contact) => `
            <tr data-contact-row="${escapeHtml(contact.id)}">
              <td>${escapeHtml(contact.organisationName || "(no organisation name)")}</td>
              <td>${escapeHtml(contact.email)}</td>
              <td>${renderStatusBadge(contact.status)}</td>
              <td>${escapeHtml(contact.suppressedReason || "")}</td>
              <td>${contact.suppressedAt ? formatDate(contact.suppressedAt) : ""}</td>
              <td class="admin-table__actions">
                <a href="/admin/outreach/contacts/${encodeURIComponent(contact.id)}/edit" class="admin-section__link">View</a>
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

export async function renderAdminOutreachSuppressionList({ query } = {}) {
  const effectiveQuery = query || new URLSearchParams();
  const statusFilter = effectiveQuery.get("status") || "";

  try {
    // Milestone 198: no single "not ACTIVE" backend filter exists (the
    // list endpoint takes one status at a time) — this page fetches
    // each suppressed status in parallel and merges them client-side.
    // Fully acceptable at this system's real scale (contact counts are
    // low hundreds, not millions); revisit if that ever changes.
    const statusesToFetch = statusFilter ? [statusFilter] : SUPPRESSED_STATUSES;
    const responses = await Promise.all(statusesToFetch.map((status) => getAdminOutreachContacts({ status, limit: 200 })));
    const contacts = responses.flatMap((response) => response.data.contacts).sort((a, b) => new Date(b.suppressedAt || b.createdAt) - new Date(a.suppressedAt || a.createdAt));
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("suppression")}

        <h2 class="admin-page__section-title">Suppression List</h2>
        <p class="admin-page__subtitle">${contacts.length} suppressed contact${contacts.length === 1 ? "" : "s"} — never included in any campaign's recipient list, regardless of filter or tag selection.</p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        <form class="admin-product-filters" data-admin-outreach-suppression-filter-form>
          <select name="status" class="form-field__input">
            <option value="">All suppressed statuses</option>
            ${SUPPRESSED_STATUSES.map((status) => `<option value="${status}"${status === statusFilter ? " selected" : ""}>${status}</option>`).join("")}
          </select>
          <button type="submit" class="btn btn--secondary btn--sm">Filter</button>
        </form>
        ${renderSuppressionTable(contacts)}
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
