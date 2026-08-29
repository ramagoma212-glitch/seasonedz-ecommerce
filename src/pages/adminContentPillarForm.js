// Content Studio Phase 2: create/edit form for ContentPillar — one
// shared template for /admin/content-studio/pillars/new and
// /admin/content-studio/pillars/:id/edit, same "create" vs "edit"
// split as adminReferralAffiliateForm.js. No hard-delete control
// anywhere on this page — deactivate/reactivate (from the list page)
// are the only status changes (brief section 19/20).

import { getAdminContentPillar } from "../js/api/contentStudioApi.js";
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
      <h1 class="admin-page__title">Content Pillar Not Found</h1>
      <p class="admin-page__subtitle">No content pillar found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/content-studio/pillars">Back to Content Pillars</a>
    </section>
  `;
}

// mode is "create" or "edit". pillar is null for create.
function renderPillarForm(mode, pillar) {
  const isEdit = mode === "edit";

  return `
    <form
      class="admin-product-form"
      data-admin-content-pillar-form
      data-mode="${mode}"
      ${isEdit ? `data-pillar-id="${escapeHtml(pillar.id)}"` : ""}
      novalidate
    >
      ${
        isEdit
          ? `
        <div class="admin-readonly-field">
          <span class="form-field__label">Status</span>
          <span class="admin-readonly-value">${pillar.isActive ? "Active" : "Inactive"}</span>
        </div>
      `
          : ""
      }

      <div class="form-field">
        <label class="form-field__label" for="pillarName">Name <span class="form-field__required">*</span></label>
        <input type="text" id="pillarName" class="form-field__input" required maxlength="100" value="${escapeHtml(pillar?.name || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="pillarDescription">Description <span class="form-field__optional">(optional)</span></label>
        <textarea id="pillarDescription" class="form-field__input form-field__textarea" rows="3" maxlength="1000">${escapeHtml(pillar?.description || "")}</textarea>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="pillarSortOrder">Display Order</label>
        <input type="number" id="pillarSortOrder" class="form-field__input" step="1" value="${pillar?.sortOrder ?? 0}" />
        <p class="admin-product-form__hint">Manual display ordering only. Lower numbers appear first.</p>
      </div>

      <div class="form-banner form-banner--error" data-admin-content-pillar-form-banner hidden></div>

      <button type="submit" class="btn btn--primary">${isEdit ? "Save Changes" : "Create Pillar"}</button>
    </form>
  `;
}

export async function renderAdminContentPillarCreate() {
  try {
    await getCurrentAdmin();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("pillars")}
        <a class="admin-back-link" href="/admin/content-studio/pillars">&larr; Back to Content Pillars</a>
        <h2 class="admin-page__section-title">Add Content Pillar</h2>
        <p class="admin-page__subtitle">New pillars start active immediately.</p>
        ${renderPillarForm("create", null)}
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

export async function renderAdminContentPillarEdit({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const response = await getAdminContentPillar(id);
    const pillar = response.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("pillars")}
        <a class="admin-back-link" href="/admin/content-studio/pillars">&larr; Back to Content Pillars</a>
        <h2 class="admin-page__section-title">Edit ${escapeHtml(pillar.name)}</h2>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderPillarForm("edit", pillar)}
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
