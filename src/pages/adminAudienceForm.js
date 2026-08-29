// Content Studio Phase 2: create/edit form for Audience — one shared
// template for /admin/content-studio/audiences/new and
// /admin/content-studio/audiences/:id/edit, same "create" vs "edit"
// split as adminContentPillarForm.js. This describes a marketing
// audience, never an individual — no email/phone/customer-lookup field
// exists anywhere on this form (brief section 16).

import { getAdminAudience } from "../js/api/contentStudioApi.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { ApiError } from "../js/apiClient.js";
import {
  consumePendingAdminMessage,
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderContentStudioSubNav } from "../components/contentStudioSubNav.js";
import { escapeHtml } from "../js/search.js";

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("content-studio")}
      <h1 class="admin-page__title">Audience Not Found</h1>
      <p class="admin-page__subtitle">No audience found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/content-studio/audiences">Back to Audiences</a>
    </section>
  `;
}

// mode is "create" or "edit". audience is null for create.
function renderAudienceForm(mode, audience) {
  const isEdit = mode === "edit";

  return `
    <form
      class="admin-product-form"
      data-admin-audience-form
      data-mode="${mode}"
      ${isEdit ? `data-audience-id="${escapeHtml(audience.id)}"` : ""}
      novalidate
    >
      ${
        isEdit
          ? `
        <div class="admin-readonly-field">
          <span class="form-field__label">Status</span>
          <span class="admin-readonly-value">${audience.isActive ? "Active" : "Inactive"}</span>
        </div>
      `
          : ""
      }

      <div class="form-field">
        <label class="form-field__label" for="audienceName">Name <span class="form-field__required">*</span></label>
        <input type="text" id="audienceName" class="form-field__input" required maxlength="100" value="${escapeHtml(audience?.name || "")}" placeholder="e.g. Parents" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="audienceDescription">Description <span class="form-field__optional">(optional)</span></label>
        <textarea id="audienceDescription" class="form-field__input form-field__textarea" rows="3" maxlength="1000">${escapeHtml(audience?.description || "")}</textarea>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="audiencePainPoints">Pain Points <span class="form-field__optional">(optional)</span></label>
        <textarea id="audiencePainPoints" class="form-field__input form-field__textarea" rows="3" maxlength="1000">${escapeHtml(audience?.painPoints || "")}</textarea>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="audienceMotivations">Motivations <span class="form-field__optional">(optional)</span></label>
        <textarea id="audienceMotivations" class="form-field__input form-field__textarea" rows="3" maxlength="1000">${escapeHtml(audience?.motivations || "")}</textarea>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="audiencePreferredContent">Preferred Content <span class="form-field__optional">(optional)</span></label>
        <textarea id="audiencePreferredContent" class="form-field__input form-field__textarea" rows="3" maxlength="1000">${escapeHtml(audience?.preferredContent || "")}</textarea>
        <p class="admin-product-form__hint">A short paragraph, not a list of individuals. This describes what this group of customers tends to respond to.</p>
      </div>

      <div class="form-banner form-banner--error" data-admin-audience-form-banner hidden></div>

      <button type="submit" class="btn btn--primary">${isEdit ? "Save Changes" : "Create Audience"}</button>
    </form>
  `;
}

export async function renderAdminAudienceCreate() {
  try {
    await getCurrentAdmin();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("audiences")}
        <a class="admin-back-link" href="/admin/content-studio/audiences">&larr; Back to Audiences</a>
        <h2 class="admin-page__section-title">Add Audience</h2>
        <p class="admin-page__subtitle">New audiences start active immediately.</p>
        ${renderAudienceForm("create", null)}
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

export async function renderAdminAudienceEdit({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const response = await getAdminAudience(id);
    const audience = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("audiences")}
        <a class="admin-back-link" href="/admin/content-studio/audiences">&larr; Back to Audiences</a>
        <h2 class="admin-page__section-title">Edit ${escapeHtml(audience.name)}</h2>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderAudienceForm("edit", audience)}
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
