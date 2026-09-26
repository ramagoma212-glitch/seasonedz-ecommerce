// Milestone 198, Part 8/9/10: admin outreach campaign create/edit form —
// name, subject, body (with {{organisation_name}}/{{contact_name}}
// personalization tokens), and the audience filter used to build the
// recipient snapshot. Sending itself happens on the campaign detail
// page (adminOutreachCampaignDetail.js), never here.

import { getAdminOutreachCampaign } from "../js/api/adminOutreachCampaignApi.js";
import { getAdminOutreachContactDistinctValues } from "../js/api/adminOutreachContactApi.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { ApiError } from "../js/apiClient.js";
import { consumePendingAdminMessage, isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting } from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderOutreachSubNav } from "../components/outreachSubNav.js";
import { escapeHtml } from "../js/search.js";

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("outreach")}
      <h1 class="admin-page__title">Campaign Not Found</h1>
      <p class="admin-page__subtitle">No campaign found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/outreach/campaigns">Back to Campaigns</a>
    </section>
  `;
}

function renderCheckboxGroup(name, values, selectedValues) {
  if (values.length === 0) return `<p class="admin-product-form__hint">No contacts have this field set yet.</p>`;
  return `
    <div class="admin-product-form__checkboxes">
      ${values.map((value) => `<label><input type="checkbox" name="${name}" value="${escapeHtml(value)}"${selectedValues.includes(value) ? " checked" : ""} /> ${escapeHtml(value)}</label>`).join("")}
    </div>
  `;
}

function renderCampaignForm(mode, campaign, distinctValues) {
  const isEdit = mode === "edit";
  const locked = Boolean(campaign?.sendStartedAt);
  const filter = campaign?.audienceFilter || {};

  return `
    <form class="admin-product-form" data-admin-outreach-campaign-form data-mode="${mode}" ${isEdit ? `data-campaign-id="${escapeHtml(campaign.id)}"` : ""} novalidate>
      ${
        isEdit
          ? `
        <div class="admin-readonly-field">
          <span class="form-field__label">Campaign ID</span>
          <span class="admin-readonly-value">${escapeHtml(campaign.id)}</span>
        </div>
        <div class="admin-readonly-field">
          <span class="form-field__label">Status</span>
          <span class="admin-readonly-value">${escapeHtml(campaign.status)}</span>
        </div>
      `
          : ""
      }
      ${locked ? `<div class="form-banner form-banner--success">This campaign has already started sending. Subject and body can no longer be edited.</div>` : ""}

      <div class="form-field">
        <label class="form-field__label" for="outreachCampaignName">Campaign Name <span class="form-field__required">*</span></label>
        <input type="text" id="outreachCampaignName" class="form-field__input" required maxlength="200" value="${escapeHtml(campaign?.name || "")}" ${locked ? "" : ""} />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="outreachCampaignSubject">Email Subject <span class="form-field__required">*</span></label>
        <input type="text" id="outreachCampaignSubject" class="form-field__input" required maxlength="200" value="${escapeHtml(campaign?.subject || "")}" ${locked ? "disabled" : ""} />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="outreachCampaignBody">Email Body <span class="form-field__required">*</span></label>
        <textarea id="outreachCampaignBody" class="form-field__input form-field__textarea" rows="10" required ${locked ? "disabled" : ""}>${escapeHtml(campaign?.body || "")}</textarea>
        <p class="admin-product-form__hint">
          Plain text only. Use <code>{{organisation_name}}</code> and <code>{{contact_name}}</code> to personalize — e.g. "Hello {{organisation_name}},".
          A real, working unsubscribe link is added automatically to every email; you don't need to write your own.
        </p>
      </div>

      <div class="form-field">
        <span class="form-field__label">Audience — restrict to (leave everything unchecked to select every active contact)</span>
        <p class="admin-product-form__hint">Organisation Type</p>
        ${renderCheckboxGroup("outreachAudienceOrganisationTypes", distinctValues.organisationTypes, filter.organisationTypes || [])}
        <p class="admin-product-form__hint">Province</p>
        ${renderCheckboxGroup("outreachAudienceProvinces", distinctValues.provinces, filter.provinces || [])}
        <p class="admin-product-form__hint">Source</p>
        ${renderCheckboxGroup("outreachAudienceSources", distinctValues.sources, filter.sources || [])}
        <p class="admin-product-form__hint">Tags</p>
        ${renderCheckboxGroup("outreachAudienceTags", distinctValues.tags, filter.tags || [])}
      </div>

      <div class="admin-product-form__row">
        <button type="button" class="btn btn--secondary" data-action="outreach-preview-audience">Preview Audience Size</button>
        <span data-admin-outreach-audience-preview></span>
      </div>

      <div class="form-banner form-banner--error" data-admin-outreach-campaign-form-banner hidden></div>

      <button type="submit" class="btn btn--primary">${isEdit ? "Save Changes" : "Create Draft Campaign"}</button>
      ${isEdit && !locked ? `<button type="button" class="btn btn--secondary" data-action="outreach-build-recipients" data-campaign-id="${escapeHtml(campaign.id)}">Build Recipient List</button>` : ""}
    </form>
  `;
}

export async function renderAdminOutreachCampaignCreate() {
  try {
    const [, distinctValuesResponse] = await Promise.all([getCurrentAdmin(), getAdminOutreachContactDistinctValues()]);

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("campaigns")}
        <a class="admin-back-link" href="/admin/outreach/campaigns">&larr; Back to Campaigns</a>
        <h2 class="admin-page__section-title">New Campaign</h2>
        <p class="admin-page__subtitle">Starts as a Draft. Build the recipient list and send from the campaign's own page once you've saved it.</p>
        ${renderCampaignForm("create", null, distinctValuesResponse.data)}
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

export async function renderAdminOutreachCampaignEdit({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const [campaignResponse, distinctValuesResponse] = await Promise.all([getAdminOutreachCampaign(id), getAdminOutreachContactDistinctValues()]);
    const campaign = campaignResponse.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("outreach")}
        <h1 class="admin-page__title">Outreach</h1>
        ${renderOutreachSubNav("campaigns")}
        <a class="admin-back-link" href="/admin/outreach/campaigns/${encodeURIComponent(id)}">&larr; Back to Campaign</a>
        <h2 class="admin-page__section-title">Edit ${escapeHtml(campaign.name)}</h2>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderCampaignForm("edit", campaign, distinctValuesResponse.data)}
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
