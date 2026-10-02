// Milestone 198, Part 5: admin outreach contact create/edit form. One
// shared template for /admin/outreach/contacts/new and /admin/outreach/
// contacts/:id/edit — same "create" vs "edit" split as
// adminReferralAffiliateForm.js. Status changes (suppress/reactivate)
// happen here too, via a dedicated control — never a silent side effect
// of an ordinary field edit.

import { getAdminOutreachContact, getAdminOutreachContactDistinctValues } from "../js/api/adminOutreachContactApi.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { ApiError } from "../js/apiClient.js";
import { consumePendingAdminMessage, isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { humanizeEnum } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

// Milestone 199: expanded to the owner's real-world B2B segment list.
// Still only a suggested-options list (see outreachContact.service.ts's
// own SUGGESTED_ORGANISATION_TYPES comment) — existing contact rows
// keep whatever organisationType they already had.
const SUGGESTED_ORGANISATION_TYPES = [
  "Bookshop",
  "Stationery Store",
  "Educational Supplier",
  "Toy / Children's Store",
  "Gift Shop",
  "Christian Bookshop / Retailer",
  "School / Preschool / ECD",
  "Church / Ministry",
  "NGO / Community Organisation",
  "Corporate / Organisation",
  "Hotel / Resort",
  "Healthcare",
  "Adult Care / Support",
  "Other",
];
const SUGGESTED_SOURCES = ["Google Maps", "Website", "Referral", "Event", "Manual research", "Existing customer", "Other"];
const CONTACT_STATUSES = ["ACTIVE", "UNSUBSCRIBED", "BOUNCED", "INVALID", "SUPPRESSED"];
// Milestone 199: the B2B sales-pipeline status — completely separate
// from CONTACT_STATUSES above, which remains the only thing that ever
// controls email eligibility. Changing this select never touches the
// Status select below, and vice versa.
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

function renderDatalistOptions(id, values) {
  return `<datalist id="${id}">${values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("")}</datalist>`;
}

function renderContactForm(mode, contact, distinctValues) {
  const isEdit = mode === "edit";
  const organisationTypeOptions = Array.from(new Set([...SUGGESTED_ORGANISATION_TYPES, ...distinctValues.organisationTypes]));
  const sourceOptions = Array.from(new Set([...SUGGESTED_SOURCES, ...distinctValues.sources]));

  return `
    <form class="admin-product-form" data-admin-outreach-contact-form data-mode="${mode}" ${isEdit ? `data-contact-id="${escapeHtml(contact.id)}" data-original-status="${escapeHtml(contact.status)}"` : ""} novalidate>
      ${
        isEdit
          ? `
        <div class="admin-readonly-field">
          <span class="form-field__label">Contact ID</span>
          <span class="admin-readonly-value">${escapeHtml(contact.id)}</span>
        </div>
      `
          : ""
      }

      <div class="form-field">
        <label class="form-field__label" for="outreachContactOrganisationName">Organisation Name <span class="form-field__optional">(optional)</span></label>
        <input type="text" id="outreachContactOrganisationName" class="form-field__input" maxlength="200" value="${escapeHtml(contact?.organisationName || "")}" />
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="outreachContactName">Contact Person <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="outreachContactName" class="form-field__input" maxlength="150" value="${escapeHtml(contact?.contactName || "")}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="outreachContactEmail">Email Address <span class="form-field__required">*</span></label>
          <input type="email" id="outreachContactEmail" class="form-field__input" required value="${escapeHtml(contact?.email || "")}" />
        </div>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="outreachContactPhone">Phone Number <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="outreachContactPhone" class="form-field__input" value="${escapeHtml(contact?.phone || "")}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="outreachContactType">Organisation Type <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="outreachContactType" class="form-field__input" list="outreachOrganisationTypeOptions" value="${escapeHtml(contact?.organisationType || "")}" />
          ${renderDatalistOptions("outreachOrganisationTypeOptions", organisationTypeOptions)}
        </div>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="outreachContactProvince">Province <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="outreachContactProvince" class="form-field__input" value="${escapeHtml(contact?.province || "")}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="outreachContactCity">City / Town <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="outreachContactCity" class="form-field__input" value="${escapeHtml(contact?.city || "")}" />
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="outreachContactWebsite">Website <span class="form-field__optional">(optional)</span></label>
        <input type="text" id="outreachContactWebsite" class="form-field__input" placeholder="https://" value="${escapeHtml(contact?.website || "")}" />
      </div>

      <h3 class="admin-page__section-title">Buyer / Procurement Contact</h3>
      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="outreachContactRole">Role / Title <span class="form-field__optional">(optional, e.g. "Buyer", "Principal")</span></label>
          <input type="text" id="outreachContactRole" class="form-field__input" maxlength="100" value="${escapeHtml(contact?.contactRole || "")}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="outreachContactBuyerEmail">Buyer Email <span class="form-field__optional">(optional — the general email above remains the one campaigns send to)</span></label>
          <input type="email" id="outreachContactBuyerEmail" class="form-field__input" value="${escapeHtml(contact?.buyerEmail || "")}" />
        </div>
      </div>

      <h3 class="admin-page__section-title">Sales Pipeline</h3>
      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="outreachContactLeadStatus">Lead Status</label>
          <select id="outreachContactLeadStatus" class="form-field__input">
            ${LEAD_STATUSES.map((value) => `<option value="${value}"${value === (contact?.leadStatus || "PROSPECT") ? " selected" : ""}>${humanizeEnum(value)}</option>`).join("")}
          </select>
          <p class="admin-product-form__hint">Separate from email eligibility below — changing this never affects whether this contact can receive campaigns.</p>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="outreachContactNextFollowUp">Next Follow-up <span class="form-field__optional">(optional)</span></label>
          <input type="date" id="outreachContactNextFollowUp" class="form-field__input" value="${contact?.nextFollowUpAt ? contact.nextFollowUpAt.slice(0, 10) : ""}" />
        </div>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="outreachContactSource">Source <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="outreachContactSource" class="form-field__input" list="outreachSourceOptions" value="${escapeHtml(contact?.source || "")}" />
          ${renderDatalistOptions("outreachSourceOptions", sourceOptions)}
        </div>
        <div class="form-field">
          <label class="form-field__label" for="outreachContactSourceUrl">Source URL <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="outreachContactSourceUrl" class="form-field__input" placeholder="https://" value="${escapeHtml(contact?.sourceUrl || "")}" />
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="outreachContactTags">Tags <span class="form-field__optional">(optional, comma-separated, e.g. "bulk books, priority")</span></label>
        <input type="text" id="outreachContactTags" class="form-field__input" value="${escapeHtml((contact?.tags || []).join(", "))}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="outreachContactNotes">Notes <span class="form-field__optional">(optional, internal only)</span></label>
        <textarea id="outreachContactNotes" class="form-field__input form-field__textarea" rows="3" maxlength="2000">${escapeHtml(contact?.notes || "")}</textarea>
      </div>

      ${
        isEdit
          ? `
        <div class="admin-product-form__row">
          <div class="form-field">
            <label class="form-field__label" for="outreachContactStatus">Status</label>
            <select id="outreachContactStatus" class="form-field__input">
              ${CONTACT_STATUSES.map((status) => `<option value="${status}"${status === contact.status ? " selected" : ""}>${status}</option>`).join("")}
            </select>
            <p class="admin-product-form__hint">Anything other than Active means this contact is permanently excluded from every future campaign, regardless of filter or tag.</p>
          </div>
          <div class="form-field">
            <label class="form-field__label" for="outreachContactSuppressedReason">Reason <span class="form-field__optional">(optional, shown only for a non-Active status)</span></label>
            <input type="text" id="outreachContactSuppressedReason" class="form-field__input" value="${escapeHtml(contact?.suppressedReason || "")}" />
          </div>
        </div>
      `
          : ""
      }

      <div class="form-banner form-banner--error" data-admin-outreach-contact-form-banner hidden></div>

      <button type="submit" class="btn btn--primary">${isEdit ? "Save Changes" : "Create Contact"}</button>
    </form>
  `;
}

export async function renderAdminOutreachContactCreate() {
  try {
    const [, distinctValuesResponse] = await Promise.all([getCurrentAdmin(), getAdminOutreachContactDistinctValues()]);

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("contacts")}
        <a class="admin-back-link" href="/admin/outreach/contacts">&larr; Back to Contacts</a>
        <h2 class="admin-page__section-title">Add Contact</h2>
        ${renderContactForm("create", null, distinctValuesResponse.data)}
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

export async function renderAdminOutreachContactEdit({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const [contactResponse, distinctValuesResponse] = await Promise.all([getAdminOutreachContact(id), getAdminOutreachContactDistinctValues()]);
    const contact = contactResponse.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("contacts")}
        <a class="admin-back-link" href="/admin/outreach/contacts">&larr; Back to Contacts</a>
        <h2 class="admin-page__section-title">Edit ${escapeHtml(contact.organisationName || contact.email)}</h2>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderContactForm("edit", contact, distinctValuesResponse.data)}
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
