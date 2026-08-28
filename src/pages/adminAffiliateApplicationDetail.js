// Version 7, Milestone 176: admin affiliate application detail/review —
// /admin/referrals/applications/:id. Full authorised detail (brief
// section 34) — identity number stays masked until the admin explicitly
// clicks "Reveal" (brief section 26), and documents are only ever
// opened via a fresh, short-lived signed URL (brief section 35), never
// a stored/permanent link.

import { getAdminAffiliateApplication, getAdminAffiliateApplicationEvents } from "../js/api/adminAffiliateApplicationsApi.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { ApiError } from "../js/apiClient.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
  consumePendingAdminMessage,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderReferralsSubNav } from "../components/referralsSubNav.js";
import { formatDate, formatDateTime, humanizeEnum, renderStatusBadge } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

function row(label, value) {
  return `<div class="order-confirmation__row"><span>${label}</span><span>${value}</span></div>`;
}

function renderPersonalDetails(app) {
  return `
    <div class="order-confirmation__card">
      <h3>Personal Details</h3>
      ${row("Full Name", escapeHtml([app.firstName, app.middleName, app.surname].filter(Boolean).join(" ") || "N/A"))}
      ${row("Date of Birth", app.dateOfBirth ? formatDate(app.dateOfBirth) : "N/A")}
      ${row("Nationality", escapeHtml(app.nationality || "N/A"))}
      ${row("Identity Type", app.identityType ? escapeHtml(humanizeEnum(app.identityType)) : "N/A")}
      ${row(
        "Identity Number",
        `<span data-identity-number-value>${escapeHtml(app.identityNumberMasked || "N/A")}</span>
         ${app.identityNumberMasked ? `<button type="button" class="btn btn--secondary btn--sm" data-action="reveal-identity-number" data-application-id="${escapeHtml(app.id)}">Reveal</button>` : ""}`
      )}
      ${row("Applicant Type", escapeHtml(humanizeEnum(app.applicantType)))}
      ${app.applicantType === "BUSINESS" ? row("Business Name", escapeHtml(app.businessName || "N/A")) : ""}
      ${app.applicantType === "BUSINESS" ? row("Registration Number", escapeHtml(app.businessRegistrationNumber || "N/A")) : ""}
      ${app.applicantType === "BUSINESS" && app.businessWebsite ? row("Business Website", `<a href="${escapeHtml(app.businessWebsite)}" target="_blank" rel="noopener noreferrer">${escapeHtml(app.businessWebsite)}</a>`) : ""}
    </div>
  `;
}

function renderContactDetails(app) {
  return `
    <div class="order-confirmation__card">
      <h3>Contact Details</h3>
      ${row("Email", escapeHtml(app.contactEmail || "N/A"))}
      ${row("Mobile", escapeHtml(app.mobileNumber || "N/A"))}
      ${app.whatsappNumber ? row("WhatsApp", escapeHtml(app.whatsappNumber)) : ""}
      ${app.preferredContactMethod ? row("Preferred Contact", escapeHtml(app.preferredContactMethod)) : ""}
    </div>
  `;
}

function renderResidentialDetails(app) {
  return `
    <div class="order-confirmation__card">
      <h3>Residential Details</h3>
      ${row("Address", escapeHtml([app.addressLine1, app.addressLine2].filter(Boolean).join(", ") || "N/A"))}
      ${row("Suburb/City", escapeHtml([app.suburb, app.city].filter(Boolean).join(", ") || "N/A"))}
      ${row("Province/Postal Code", escapeHtml([app.province, app.postalCode].filter(Boolean).join(", ") || "N/A"))}
      ${row("Country", escapeHtml(app.country || "N/A"))}
    </div>
  `;
}

function renderPromotionalInfo(app) {
  const links = ["websiteUrl", "facebookUrl", "instagramUrl", "tiktokUrl", "youtubeUrl"].filter((k) => app[k]);
  return `
    <div class="order-confirmation__card">
      <h3>Affiliate / Promotional Information</h3>
      ${row("Promotion Plan", escapeHtml(app.promotionPlan || "N/A"))}
      ${row("Motivation", escapeHtml(app.motivation || "N/A"))}
      ${links.length ? row("Platforms", links.map((k) => `<a href="${escapeHtml(app[k])}" target="_blank" rel="noopener noreferrer">${escapeHtml(app[k])}</a>`).join("<br />")) : ""}
      ${app.otherPlatform ? row("Other Platform", escapeHtml(app.otherPlatform)) : ""}
      ${app.audienceSize ? row("Audience Size", escapeHtml(app.audienceSize)) : ""}
    </div>
  `;
}

function documentClassificationLabel(doc) {
  const labels = { MATCH: "Document type confirmed", MISMATCH: "Requires replacement", MANUAL_REVIEW: "Requires manual review" };
  return doc.classification ? labels[doc.classification] || doc.classification : "Not yet classified";
}

function renderDocumentCard(doc, applicationId) {
  const typeLabel = doc.slot === "IDENTITY" ? humanizeEnum(doc.identityDocumentType || "") : humanizeEnum(doc.proofOfResidenceType || "");
  return `
    <div class="order-confirmation__row">
      <span>${doc.slot === "IDENTITY" ? "Identity Document" : "Proof of Residence"}${doc.isCurrent ? "" : " (superseded)"}</span>
      <span>
        ${escapeHtml(typeLabel)} &mdash; ${escapeHtml(documentClassificationLabel(doc))}
        ${doc.isCurrent ? `<button type="button" class="btn btn--secondary btn--sm" data-action="view-affiliate-document" data-application-id="${escapeHtml(applicationId)}" data-document-id="${escapeHtml(doc.id)}">View</button>` : ""}
      </span>
    </div>
    ${doc.classificationReason ? `<p class="admin-product-form__hint">${escapeHtml(doc.classificationReason)}</p>` : ""}
    ${doc.nameMatchResult ? `<p class="admin-product-form__hint">Name match: ${escapeHtml(humanizeEnum(doc.nameMatchResult))}</p>` : ""}
    ${doc.addressMatchResult ? `<p class="admin-product-form__hint">Address match: ${escapeHtml(humanizeEnum(doc.addressMatchResult))}</p>` : ""}
    ${doc.idNumberMatchResult ? `<p class="admin-product-form__hint">Identity number match: ${escapeHtml(humanizeEnum(doc.idNumberMatchResult))}</p>` : ""}
  `;
}

function renderDocuments(app) {
  if (app.documents.length === 0) {
    return `<div class="order-confirmation__card"><h3>Documents</h3><p class="admin-product-form__hint">No documents uploaded yet.</p></div>`;
  }
  return `
    <div class="order-confirmation__card">
      <h3>Documents</h3>
      <div class="form-banner form-banner--error" data-affiliate-document-view-banner hidden></div>
      ${app.documents.map((doc) => renderDocumentCard(doc, app.id)).join("")}
    </div>
  `;
}

function renderDecisionActions(app) {
  if (app.status !== "UNDER_REVIEW") return "";
  return `
    <div class="order-confirmation__card">
      <h3>Decision</h3>
      <div class="form-banner form-banner--error" data-affiliate-application-decision-banner hidden></div>

      <div class="form-field">
        <label class="form-field__label" for="correctionArea">Affected Area <span class="form-field__optional">(for Request Correction)</span></label>
        <select id="correctionArea" class="form-field__input">
          <option value="PERSONAL_DETAILS">Personal Details</option>
          <option value="IDENTITY_DOCUMENT">Identity Document</option>
          <option value="PROOF_OF_RESIDENCE">Proof of Residence</option>
          <option value="OTHER">Other</option>
        </select>
      </div>
      <div class="form-field">
        <label class="form-field__label" for="decisionReason">Reason <span class="form-field__optional">(required for Request Correction / Reject)</span></label>
        <textarea id="decisionReason" class="form-field__input form-field__textarea" rows="3"></textarea>
      </div>

      <div class="order-confirmation__actions">
        <button type="button" class="btn btn--secondary" data-action="request-affiliate-application-correction" data-application-id="${escapeHtml(app.id)}">Request Correction</button>
        <button type="button" class="btn btn--secondary" data-action="reject-affiliate-application" data-application-id="${escapeHtml(app.id)}">Reject</button>
        <button type="button" class="btn btn--primary" data-action="approve-affiliate-application" data-application-id="${escapeHtml(app.id)}">Approve</button>
      </div>
    </div>
  `;
}

function renderEventHistory(events) {
  if (!events || events.length === 0) return "";
  return `
    <div class="order-confirmation__card">
      <h3>Audit History</h3>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>When</th><th>Actor</th><th>Event</th><th>Summary</th></tr></thead>
          <tbody>
            ${events
              .map(
                (event) => `
              <tr>
                <td>${formatDateTime(event.createdAt)}</td>
                <td>${escapeHtml(humanizeEnum(event.actorType))}</td>
                <td>${escapeHtml(humanizeEnum(event.eventType))}</td>
                <td>${escapeHtml(event.summary)}</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("referrals")}
      <h1 class="admin-page__title">Application Not Found</h1>
      <p class="admin-page__subtitle">No affiliate application found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/referrals/applications">Back to Applications</a>
    </section>
  `;
}

export async function renderAdminAffiliateApplicationDetail({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    await getCurrentAdmin();
    const [detailResponse, eventsResponse] = await Promise.all([
      getAdminAffiliateApplication(id),
      getAdminAffiliateApplicationEvents(id).catch(() => ({ data: { events: [] } })),
    ]);
    const app = detailResponse.data.application;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("referrals")}
        <h1 class="admin-page__title">Referrals</h1>
        ${renderReferralsSubNav("applications")}
        <a class="admin-back-link" href="/admin/referrals/applications">&larr; Back to Applications</a>

        <div class="admin-section__header">
          <h2 class="admin-page__section-title">${escapeHtml([app.firstName, app.surname].filter(Boolean).join(" ") || "Affiliate Application")}</h2>
          ${renderStatusBadge(app.status)}
        </div>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${app.actionRequiredReason ? `<div class="form-banner form-banner--error"><strong>${escapeHtml(humanizeEnum(app.actionRequiredArea || "OTHER"))}:</strong> ${escapeHtml(app.actionRequiredReason)}</div>` : ""}

        ${renderPersonalDetails(app)}
        ${renderContactDetails(app)}
        ${renderResidentialDetails(app)}
        ${renderPromotionalInfo(app)}
        ${renderDocuments(app)}
        ${renderDecisionActions(app)}
        ${renderEventHistory(eventsResponse.data.events)}
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
