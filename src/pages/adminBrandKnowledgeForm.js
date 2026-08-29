// Content Studio Phase 2: create/edit form for BrandKnowledgeEntry —
// one shared template for /admin/content-studio/brand-knowledge/new
// and /admin/content-studio/brand-knowledge/:id/edit, same "create" vs
// "edit" split as adminContentPillarForm.js. No hard-delete control —
// deactivate/reactivate (from the list page) are the only status
// changes.

import { getAdminBrandKnowledgeEntry } from "../js/api/contentStudioApi.js";
import { getAdminContentPillars, getAdminAudiences } from "../js/api/contentStudioApi.js";
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
import { humanizeEnum } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const CATEGORY_OPTIONS = [
  "BRAND_FACT",
  "BRAND_VOICE",
  "WRITING_RULE",
  "VISUAL_RULE",
  "PRODUCT_POSITIONING",
  "AUDIENCE_INSIGHT",
  "APPROVED_CLAIM",
  "PROHIBITED_CLAIM",
  "TERMINOLOGY",
  "CALL_TO_ACTION",
  "PLATFORM_RULE",
  "SEASONAL_GUIDANCE",
  "CAMPAIGN_HISTORY",
];

const SOURCE_TYPE_OPTIONS = ["OWNER_APPROVED", "WEBSITE", "PRODUCT_DATABASE", "POLICY", "HISTORICAL_CAMPAIGN", "INTERNAL_GUIDANCE"];

function renderNotFound(id) {
  return `
    <section class="container admin-page">
      ${renderAdminNav("content-studio")}
      <h1 class="admin-page__title">Brand Knowledge Entry Not Found</h1>
      <p class="admin-page__subtitle">No brand knowledge entry found with id &ldquo;${escapeHtml(id)}&rdquo;.</p>
      <a class="btn btn--secondary" href="/admin/content-studio/brand-knowledge">Back to Brand Knowledge</a>
    </section>
  `;
}

// mode is "create" or "edit". entry is null for create.
function renderEntryForm(mode, entry, pillars, audiences) {
  const isEdit = mode === "edit";
  const tagsValue = entry?.tags?.join(", ") || "";

  return `
    <form
      class="admin-product-form"
      data-admin-brand-knowledge-form
      data-mode="${mode}"
      ${isEdit ? `data-entry-id="${escapeHtml(entry.id)}"` : ""}
      novalidate
    >
      ${
        isEdit
          ? `
        <div class="admin-readonly-field">
          <span class="form-field__label">Status</span>
          <span class="admin-readonly-value">${entry.isActive ? "Active" : "Inactive"}</span>
        </div>
      `
          : ""
      }

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="entryCategory">Category <span class="form-field__required">*</span></label>
          <select id="entryCategory" class="form-field__input" required>
            ${CATEGORY_OPTIONS.map((option) => `<option value="${option}"${option === entry?.category ? " selected" : ""}>${humanizeEnum(option)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="entrySourceType">Source <span class="form-field__required">*</span></label>
          <select id="entrySourceType" class="form-field__input" required>
            ${SOURCE_TYPE_OPTIONS.map((option) => `<option value="${option}"${option === entry?.sourceType ? " selected" : ""}>${humanizeEnum(option)}</option>`).join("")}
          </select>
          <p class="admin-product-form__hint">Where this information actually came from, never a placeholder. See Phase 2's own "no AI-generated seed data" rule.</p>
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="entryTitle">Title <span class="form-field__required">*</span></label>
        <input type="text" id="entryTitle" class="form-field__input" required maxlength="200" value="${escapeHtml(entry?.title || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="entryBody">Body <span class="form-field__required">*</span></label>
        <textarea id="entryBody" class="form-field__input form-field__textarea" rows="5" required maxlength="4000">${escapeHtml(entry?.body || "")}</textarea>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="entryTags">Tags <span class="form-field__optional">(optional, comma separated)</span></label>
        <input type="text" id="entryTags" class="form-field__input" maxlength="600" value="${escapeHtml(tagsValue)}" placeholder="e.g. spelling, tone" />
        <p class="admin-product-form__hint">Used for future retrieval, up to 15 short tags, lowercased automatically.</p>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="entryPillar">Content Pillar <span class="form-field__optional">(optional)</span></label>
          <select id="entryPillar" class="form-field__input">
            <option value="">None, applies broadly</option>
            ${pillars.map((pillar) => `<option value="${escapeHtml(pillar.id)}"${pillar.id === entry?.pillarId ? " selected" : ""}>${escapeHtml(pillar.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="entryAudience">Audience <span class="form-field__optional">(optional)</span></label>
          <select id="entryAudience" class="form-field__input">
            <option value="">None, applies broadly</option>
            ${audiences.map((audience) => `<option value="${escapeHtml(audience.id)}"${audience.id === entry?.audienceId ? " selected" : ""}>${escapeHtml(audience.name)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="entryRelatedProductId">Related Product ID <span class="form-field__optional">(optional)</span></label>
        <input type="text" id="entryRelatedProductId" class="form-field__input" value="${escapeHtml(entry?.relatedProductId || "")}" placeholder="Leave blank unless this concerns one specific product" />
        <p class="admin-product-form__hint">
          Guidance ABOUT a product only. Never a substitute for that product's own price, stock or name, which the Products page always keeps
          current. Find a product's id from its edit page URL.
        </p>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="entrySourceReference">Source Reference <span class="form-field__optional">(optional)</span></label>
        <input type="text" id="entrySourceReference" class="form-field__input" maxlength="300" value="${escapeHtml(entry?.sourceReference || "")}" placeholder="A URL, file, or note on where this can be checked" />
      </div>

      <div class="form-banner form-banner--error" data-admin-brand-knowledge-form-banner hidden></div>

      <button type="submit" class="btn btn--primary">${isEdit ? "Save Changes" : "Create Entry"}</button>
    </form>
  `;
}

async function loadPillarsAndAudiences() {
  const [pillarsResponse, audiencesResponse] = await Promise.all([getAdminContentPillars({ isActive: true }), getAdminAudiences({ isActive: true })]);
  return { pillars: pillarsResponse.data, audiences: audiencesResponse.data };
}

export async function renderAdminBrandKnowledgeCreate() {
  try {
    const { pillars, audiences } = await loadPillarsAndAudiences();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("brand-knowledge")}
        <a class="admin-back-link" href="/admin/content-studio/brand-knowledge">&larr; Back to Brand Knowledge</a>
        <h2 class="admin-page__section-title">Add Brand Knowledge Entry</h2>
        <p class="admin-page__subtitle">New entries start active immediately.</p>
        ${renderEntryForm("create", null, pillars, audiences)}
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

export async function renderAdminBrandKnowledgeEdit({ id } = {}) {
  if (!id) return renderNotFound("");

  try {
    const [entryResponse, extra] = await Promise.all([getAdminBrandKnowledgeEntry(id), loadPillarsAndAudiences()]);
    const entry = entryResponse.data;
    const successMessage = consumePendingAdminMessage();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("brand-knowledge")}
        <a class="admin-back-link" href="/admin/content-studio/brand-knowledge">&larr; Back to Brand Knowledge</a>
        <h2 class="admin-page__section-title">Edit ${escapeHtml(entry.title)}</h2>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${renderEntryForm("edit", entry, extra.pillars, extra.audiences)}
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
