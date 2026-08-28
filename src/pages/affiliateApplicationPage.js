// Version 7, Milestone 176: affiliate application/document verification
// — /account/affiliate-application. Reuses this exact customer session
// (requireCustomerAuth on the backend) — no second affiliate login
// anywhere. One long form, not a multi-step wizard (brief section 29:
// "do not compromise data integrity merely to force multi-step UI") —
// every section is visible at once, saved via one PATCH per "Save"
// click that always sends the full current form snapshot.

import { getMyAffiliateApplication } from "../js/api/customerApi.js";
import { ApiError } from "../js/apiClient.js";
import { escapeHtml } from "../js/search.js";

const SA_PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu Natal", "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape"];

function formatDate(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toISOString().slice(0, 10);
}

function humanizeEnum(value) {
  if (!value) return "";
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function renderTextField({ id, label, value, type = "text", required = false, hint = "" }) {
  return `
    <div class="form-field">
      <label class="form-field__label" for="${id}">
        ${label} ${required ? '<span class="form-field__required" aria-hidden="true">*</span>' : '<span class="form-field__optional">(optional)</span>'}
      </label>
      <input type="${type}" id="${id}" name="${id}" class="form-field__input" value="${escapeHtml(value || "")}" ${required ? "required" : ""} />
      ${hint ? `<p class="admin-product-form__hint">${hint}</p>` : ""}
      <span class="form-field__error" data-error-for="${id}"></span>
    </div>
  `;
}

function renderTextArea({ id, label, value, required = false }) {
  return `
    <div class="form-field form-field--full">
      <label class="form-field__label" for="${id}">
        ${label} ${required ? '<span class="form-field__required" aria-hidden="true">*</span>' : '<span class="form-field__optional">(optional)</span>'}
      </label>
      <textarea id="${id}" name="${id}" class="form-field__input form-field__textarea" rows="3" ${required ? "required" : ""}>${escapeHtml(value || "")}</textarea>
      <span class="form-field__error" data-error-for="${id}"></span>
    </div>
  `;
}

function renderSelect({ id, label, value, options, required = false }) {
  return `
    <div class="form-field">
      <label class="form-field__label" for="${id}">
        ${label} ${required ? '<span class="form-field__required" aria-hidden="true">*</span>' : '<span class="form-field__optional">(optional)</span>'}
      </label>
      <select id="${id}" name="${id}" class="form-field__input" ${required ? "required" : ""}>
        <option value="">Select&hellip;</option>
        ${options.map((opt) => `<option value="${opt.value}"${opt.value === value ? " selected" : ""}>${opt.label}</option>`).join("")}
      </select>
      <span class="form-field__error" data-error-for="${id}"></span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Document upload slots (brief sections 11-12, 17, 24, 28, 40).
// ---------------------------------------------------------------------------

function classificationBadge(doc) {
  if (!doc) return "";
  const labels = {
    MATCH: "Document type confirmed",
    MISMATCH: "Requires replacement",
    MANUAL_REVIEW: "Requires manual review",
  };
  return `<span class="badge">${labels[doc.classification] || "Uploaded"}</span>`;
}

function renderDocumentSlot({ slot, title, typeFieldId, typeOptions, existingDoc, application }) {
  const disabled = application.status !== "DRAFT" && application.status !== "ACTION_REQUIRED";
  return `
    <div class="order-confirmation__card account-affiliate" data-document-slot="${slot}">
      <h4 class="checkout-section__label">${title}</h4>
      ${
        existingDoc
          ? `<div class="order-confirmation__row"><span>Current file</span><span>${escapeHtml(existingDoc.fileName)}</span></div>
             <div class="order-confirmation__row"><span>Status</span><span>${classificationBadge(existingDoc)}</span></div>
             ${existingDoc.classificationReason ? `<p class="admin-product-form__hint">${escapeHtml(existingDoc.classificationReason)}</p>` : ""}
             ${existingDoc.nameMatchResult === "MISMATCH" ? `<p class="form-banner form-banner--error">The name on this document does not appear to match the name in your affiliate application. Please check your details or upload a document belonging to the applicant.</p>` : ""}
             ${existingDoc.addressMatchResult === "MISMATCH" ? `<p class="form-banner form-banner--error">The address on this document does not appear to match your residential address. Please check your details or upload a different document.</p>` : ""}`
          : `<p class="admin-product-form__hint">No document uploaded yet.</p>`
      }
      ${
        !disabled
          ? `
        <div class="form-field">
          <label class="form-field__label" for="${typeFieldId}">Document Type <span class="form-field__required" aria-hidden="true">*</span></label>
          <select id="${typeFieldId}" class="form-field__input" data-document-type-select data-slot="${slot}">
            <option value="">Select&hellip;</option>
            ${typeOptions.map((opt) => `<option value="${opt.value}">${opt.label}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="${slot}FileInput">${existingDoc ? "Replace file" : "Choose file"} <span class="form-field__optional">(PDF, JPG or PNG, max 8&nbsp;MB)</span></label>
          <input type="file" id="${slot}FileInput" data-document-file-input data-slot="${slot}" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" />
        </div>
        <div class="form-banner form-banner--error" data-document-upload-banner="${slot}" hidden></div>
        <button type="button" class="btn btn--secondary btn--sm" data-action="upload-affiliate-document" data-slot="${slot}">
          ${existingDoc ? "Replace Document" : "Upload Document"}
        </button>
      `
          : ""
      }
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Full editable form.
// ---------------------------------------------------------------------------

function renderApplicantTypeFields(app) {
  return `
    <div class="admin-product-form__row" data-business-fields ${app.applicantType === "BUSINESS" ? "" : "hidden"}>
      ${renderTextField({ id: "businessName", label: "Business Name", value: app.businessName, required: app.applicantType === "BUSINESS" })}
      ${renderTextField({ id: "businessRegistrationNumber", label: "Company Registration Number", value: app.businessRegistrationNumber })}
      ${renderTextField({ id: "businessWebsite", label: "Business Website", value: app.businessWebsite, type: "url" })}
    </div>
  `;
}

function renderEditableForm(app) {
  const identityDoc = app.documents.find((d) => d.slot === "IDENTITY");
  const porDoc = app.documents.find((d) => d.slot === "PROOF_OF_RESIDENCE");
  const isActionRequired = app.status === "ACTION_REQUIRED";

  return `
    ${
      isActionRequired
        ? `<div class="form-banner form-banner--error">
             <strong>Action needed${app.actionRequiredArea ? `: ${escapeHtml(humanizeEnum(app.actionRequiredArea))}` : ""}.</strong>
             ${escapeHtml(app.actionRequiredReason || "Please review and correct your application.")}
           </div>`
        : ""
    }

    <form id="affiliate-application-form" data-affiliate-application-form novalidate>
      <div class="form-banner form-banner--error" data-affiliate-application-banner hidden></div>
      <div class="form-banner form-banner--success" data-affiliate-application-success hidden></div>

      <h3 class="checkout-section__label">Personal Details</h3>
      <div class="admin-product-form__row">
        ${renderTextField({ id: "firstName", label: "First Name", value: app.firstName, required: true })}
        ${renderTextField({ id: "middleName", label: "Middle Name", value: app.middleName })}
        ${renderTextField({ id: "surname", label: "Surname", value: app.surname, required: true })}
      </div>
      <div class="admin-product-form__row">
        ${renderTextField({ id: "dateOfBirth", label: "Date of Birth", value: formatDate(app.dateOfBirth), type: "date", required: true })}
        ${renderTextField({ id: "nationality", label: "Nationality", value: app.nationality, required: true })}
      </div>
      <div class="admin-product-form__row">
        ${renderSelect({ id: "identityType", label: "Identity Document Type", value: app.identityType, required: true, options: [{ value: "SA_ID", label: "South African ID" }, { value: "PASSPORT", label: "Passport" }] })}
        <div class="form-field" data-id-number-field ${app.identityType === "SA_ID" ? "" : "hidden"}>
          ${renderTextField({ id: "idNumber", label: "ID Number", value: app.idNumberMasked, required: app.identityType === "SA_ID" })}
        </div>
        <div class="form-field" data-passport-number-field ${app.identityType === "PASSPORT" ? "" : "hidden"}>
          ${renderTextField({ id: "passportNumber", label: "Passport Number", value: app.passportNumberMasked, required: app.identityType === "PASSPORT" })}
        </div>
      </div>

      <h3 class="checkout-section__label">Contact Details</h3>
      <div class="admin-product-form__row">
        ${renderTextField({ id: "contactEmail", label: "Primary Email Address", value: app.contactEmail, type: "email", required: true })}
        ${renderTextField({ id: "mobileNumber", label: "Mobile Number", value: app.mobileNumber, required: true })}
        ${renderTextField({ id: "whatsappNumber", label: "WhatsApp Number", value: app.whatsappNumber })}
      </div>
      ${renderTextField({ id: "preferredContactMethod", label: "Preferred Contact Method", value: app.preferredContactMethod })}

      <h3 class="checkout-section__label">Residential Details</h3>
      ${renderTextField({ id: "addressLine1", label: "Address Line 1", value: app.addressLine1, required: true })}
      ${renderTextField({ id: "addressLine2", label: "Address Line 2", value: app.addressLine2 })}
      <div class="admin-product-form__row">
        ${renderTextField({ id: "suburb", label: "Suburb", value: app.suburb, required: true })}
        ${renderTextField({ id: "city", label: "City/Town", value: app.city, required: true })}
      </div>
      <div class="admin-product-form__row">
        ${renderSelect({ id: "province", label: "Province", value: app.province, required: true, options: SA_PROVINCES.map((p) => ({ value: p, label: p })) })}
        ${renderTextField({ id: "postalCode", label: "Postal Code", value: app.postalCode, required: true })}
        ${renderTextField({ id: "country", label: "Country", value: app.country || "South Africa", required: true })}
      </div>

      <h3 class="checkout-section__label">Applicant Type</h3>
      ${renderSelect({ id: "applicantType", label: "Applying As", value: app.applicantType, required: true, options: [{ value: "INDIVIDUAL", label: "Individual" }, { value: "BUSINESS", label: "Business" }] })}
      ${renderApplicantTypeFields(app)}

      <h3 class="checkout-section__label">Affiliate Information</h3>
      ${renderTextArea({ id: "promotionPlan", label: "How do you plan to promote Seasonedz?", value: app.promotionPlan, required: true })}
      <div class="admin-product-form__row">
        ${renderTextField({ id: "websiteUrl", label: "Website", value: app.websiteUrl, type: "url" })}
        ${renderTextField({ id: "facebookUrl", label: "Facebook", value: app.facebookUrl, type: "url" })}
        ${renderTextField({ id: "instagramUrl", label: "Instagram", value: app.instagramUrl, type: "url" })}
      </div>
      <div class="admin-product-form__row">
        ${renderTextField({ id: "tiktokUrl", label: "TikTok", value: app.tiktokUrl, type: "url" })}
        ${renderTextField({ id: "youtubeUrl", label: "YouTube", value: app.youtubeUrl, type: "url" })}
        ${renderTextField({ id: "otherPlatform", label: "Other Platform", value: app.otherPlatform })}
      </div>
      ${renderTextField({ id: "audienceSize", label: "Audience/Follower Size", value: app.audienceSize })}
      ${renderTextArea({ id: "motivation", label: "Why do you want to join the Seasonedz Affiliate Programme?", value: app.motivation, required: true })}

      <h3 class="checkout-section__label">Identity Verification</h3>
      <p class="admin-product-form__hint">
        We ask for an identity document and proof of residence to help us verify genuine affiliate applicants. Automated
        checks may confirm a document's type and that names and addresses appear consistent. This assists our review but
        never itself approves your application. Final approval always remains a manual Seasonedz Group decision.
      </p>
      ${renderDocumentSlot({ slot: "IDENTITY", title: "Identity Document", typeFieldId: "identityDocumentType", typeOptions: [{ value: "SA_ID", label: "South African ID" }, { value: "PASSPORT", label: "Passport" }], existingDoc: identityDoc, application: app })}

      ${renderDocumentSlot({ slot: "PROOF_OF_RESIDENCE", title: "Proof of Residence", typeFieldId: "proofOfResidenceType", typeOptions: [{ value: "BANK_STATEMENT", label: "Bank Statement" }, { value: "MUNICIPAL_ACCOUNT_OR_LETTER", label: "Municipal Account or Municipal Letter" }, { value: "PROOF_OF_RESIDENCE", label: "Other Accepted Proof of Residence" }], existingDoc: porDoc, application: app })}

      <h3 class="checkout-section__label">Declarations</h3>
      <label class="account-preferences__field">
        <input type="checkbox" id="infoAccurateConfirmed" ${app.infoAccurateConfirmed ? "checked" : ""} />
        <span>I confirm that the information and documents I have provided are accurate and belong to me or the business I am authorised to represent.</span>
      </label>
      <label class="account-preferences__field">
        <input type="checkbox" id="termsAccepted" ${app.termsAccepted ? "checked" : ""} />
        <span>I have read and agree to the <a href="/affiliate-terms" target="_blank" rel="noopener noreferrer">Seasonedz Affiliate Programme Terms</a>.</span>
      </label>
      <p class="admin-product-form__hint">
        See our <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy Policy</a> for how your identity and residential
        information is collected, reviewed and stored for Affiliate Programme onboarding.
      </p>

      <div class="order-confirmation__actions">
        <button type="button" class="btn btn--secondary" data-action="save-affiliate-application-draft">Save Draft</button>
        <button type="submit" class="btn btn--primary">Submit Application</button>
      </div>
    </form>
  `;
}

// ---------------------------------------------------------------------------
// Read-only status views (UNDER_REVIEW / APPROVED / REJECTED).
// ---------------------------------------------------------------------------

function renderUnderReview() {
  return `
    <div class="order-confirmation__card">
      <div class="order-confirmation__row"><span>Status</span><span class="badge">Under Review</span></div>
      <p class="admin-product-form__hint">Your application is with the Seasonedz Group team for review. We'll be in touch once a decision has been made.</p>
    </div>
    <div class="order-confirmation__actions"><a class="btn btn--secondary" href="/account">Back to My Account</a></div>
  `;
}

function renderApproved() {
  return `
    <div class="order-confirmation__card">
      <div class="order-confirmation__row"><span>Status</span><span class="badge">Approved</span></div>
      <p class="admin-product-form__hint">Your application has been approved. Visit your account to see your referral link and affiliate portal.</p>
    </div>
    <div class="order-confirmation__actions"><a class="btn btn--secondary" href="/account">Go to My Account</a></div>
  `;
}

function renderRejected() {
  return `
    <div class="order-confirmation__card">
      <div class="order-confirmation__row"><span>Status</span><span class="badge">Not Approved</span></div>
      <p class="admin-product-form__hint">Your affiliate application was not approved. Contact Seasonedz Group if you have questions.</p>
    </div>
    <div class="order-confirmation__actions"><a class="btn btn--secondary" href="/account">Back to My Account</a></div>
  `;
}

function renderNoApplicationNeeded() {
  return `
    <div class="form-banner form-banner--success">You're already part of the Seasonedz Affiliate Programme. No application is needed.</div>
    <div class="order-confirmation__actions"><a class="btn btn--secondary" href="/account">Go to My Account</a></div>
  `;
}

function renderNeedsLogin() {
  return `
    <div class="demo-notice">
      <span class="demo-notice__icon" aria-hidden="true">&#8505;</span>
      <div>
        <strong>Please sign in to apply.</strong>
        <p><a href="/account">Sign in</a> to your Seasonedz account to start or continue your affiliate application.</p>
      </div>
    </div>
  `;
}

function renderBackendUnavailable() {
  return `<div class="form-banner form-banner--error">We could not connect right now. Please try again shortly.</div>`;
}

export async function renderAffiliateApplicationPage() {
  let body;
  try {
    const response = await getMyAffiliateApplication();
    const { hasApplication, application } = response.data;

    if (!hasApplication) {
      body = renderNoApplicationNeeded();
    } else if (application.status === "DRAFT" || application.status === "ACTION_REQUIRED") {
      body = renderEditableForm(application);
    } else if (application.status === "UNDER_REVIEW") {
      body = renderUnderReview();
    } else if (application.status === "APPROVED") {
      body = renderApproved();
    } else {
      body = renderRejected();
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      body = renderNeedsLogin();
    } else {
      body = renderBackendUnavailable();
    }
  }

  return `
    <section class="container account-page">
      <h1 class="stub-page__title">Affiliate Programme Application</h1>
      ${body}
    </section>
  `;
}
