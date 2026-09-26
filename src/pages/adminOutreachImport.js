// Milestone 198, Part 6: bulk contact import — CSV upload or a plain
// "paste contacts" box, both feeding the same preview/commit pipeline.
// Import and sending are always two separate actions — this page never
// sends anything, only ever creates OutreachContact rows.

import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { escapeHtml } from "../js/search.js";

export async function renderAdminOutreachImport() {
  try {
    await getCurrentAdmin();

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("contacts")}
        <a class="admin-back-link" href="/admin/outreach/contacts">&larr; Back to Contacts</a>
        <h2 class="admin-page__section-title">Bulk Import Contacts</h2>
        <p class="admin-page__subtitle">Upload a CSV or paste a list of contacts. Nothing is saved until you review the preview below and confirm.</p>

        <div class="admin-product-form">
          <div class="form-field">
            <label class="form-field__label" for="outreachImportCsvFile">CSV File <span class="form-field__optional">(optional)</span></label>
            <input type="file" id="outreachImportCsvFile" accept=".csv,text/csv" class="form-field__input" />
            <p class="admin-product-form__hint">
              Expected columns (any order, none required except email): organisation_name, contact_name, email, phone, organisation_type,
              province, city, website, source, source_url, notes, tags (separate multiple tags with a semicolon).
            </p>
          </div>

          <div class="form-field">
            <label class="form-field__label" for="outreachImportPastedText">Or Paste Contacts <span class="form-field__optional">(optional)</span></label>
            <textarea id="outreachImportPastedText" class="form-field__input form-field__textarea" rows="8" placeholder="school@example.com&#10;church@example.com&#10;Sunnyside Primary, books@example.com, Mrs Nkosi, 0821234567"></textarea>
            <p class="admin-product-form__hint">One email per line, or "Organisation, email, contact name, phone" per line.</p>
          </div>

          <button type="button" class="btn btn--primary" data-action="outreach-import-preview">Preview Import</button>
          <div class="form-banner form-banner--error" data-admin-outreach-import-banner hidden></div>
        </div>

        <div data-admin-outreach-import-preview-section hidden>
          <h3 class="admin-page__section-title">Import Preview</h3>
          <div class="admin-cards" data-admin-outreach-import-summary></div>
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Email</th>
                  <th>Organisation</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody data-admin-outreach-import-preview-rows></tbody>
            </table>
          </div>
          <button type="button" class="btn btn--primary" data-action="outreach-import-commit">Import Valid Contacts</button>
        </div>
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

const OUTCOME_LABELS = {
  valid: "Valid — will be imported",
  duplicate_in_db: "Already in database — skipped",
  duplicate_in_upload: "Duplicate within this upload — skipped",
  invalid_email: "Invalid email — skipped",
  suppressed: "Suppressed/unsubscribed — skipped",
};

export function renderImportPreviewSummary(counts) {
  function statCard(label, value) {
    return `<div class="admin-card"><p class="admin-card__label">${label}</p><p class="admin-card__value">${value}</p></div>`;
  }
  return [
    statCard("Valid", counts.valid),
    statCard("Already in database", counts.duplicateInDb),
    statCard("Duplicate in upload", counts.duplicateInUpload),
    statCard("Invalid email", counts.invalidEmail),
    statCard("Suppressed", counts.suppressed),
  ].join("");
}

export function renderImportPreviewRows(rows) {
  return rows
    .map(
      (row) => `
    <tr>
      <td>${row.rowNumber}</td>
      <td>${escapeHtml(row.email || "")}</td>
      <td>${escapeHtml(row.organisationName || row.existingOrganisationName || "")}</td>
      <td>${escapeHtml(OUTCOME_LABELS[row.outcome] || row.outcome)}</td>
    </tr>
  `
    )
    .join("");
}
