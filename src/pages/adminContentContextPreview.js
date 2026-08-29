// Content Studio Phase 3A, brief sections 31-33: lets an ADMIN or
// STAFF see exactly what buildContentContext() assembles for a chosen
// product/audience/pillar/platform selection. This is NEVER an AI
// generation — there is no "Generate" button anywhere on this page,
// only "Preview Context". No secret, credential, or raw provider
// system prompt is ever rendered here (the backend's own
// SEASONEDZ_SYSTEM_POLICY is never returned by the context-preview
// endpoint at all — see contentContextPreview.controller.ts).

import { getAdminContentPillars, getAdminAudiences } from "../js/api/contentStudioApi.js";
import { getAdminProducts } from "../js/api/adminDashboardApi.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderContentStudioSubNav } from "../components/contentStudioSubNav.js";
import { formatCurrency } from "../js/adminFormat.js";
import { escapeHtml } from "../js/search.js";

const PLATFORM_OPTIONS = ["INSTAGRAM", "FACEBOOK", "TIKTOK"];

function renderForm(products, pillars, audiences) {
  return `
    <form class="admin-product-form" data-admin-context-preview-form novalidate>
      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="contextPreviewProduct">Product <span class="form-field__optional">(optional)</span></label>
          <select id="contextPreviewProduct" class="form-field__input">
            <option value="">None</option>
            ${products.map((product) => `<option value="${escapeHtml(product.id)}">${escapeHtml(product.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="contextPreviewAudience">Audience <span class="form-field__optional">(optional)</span></label>
          <select id="contextPreviewAudience" class="form-field__input">
            <option value="">None</option>
            ${audiences.map((audience) => `<option value="${escapeHtml(audience.id)}">${escapeHtml(audience.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="contextPreviewPillar">Content Pillar <span class="form-field__optional">(optional)</span></label>
          <select id="contextPreviewPillar" class="form-field__input">
            <option value="">None</option>
            ${pillars.map((pillar) => `<option value="${escapeHtml(pillar.id)}">${escapeHtml(pillar.name)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="form-field">
        <span class="form-field__label">Platforms <span class="form-field__optional">(optional)</span></span>
        <div class="admin-product-form__checkboxes">
          ${PLATFORM_OPTIONS.map((platform) => `<label><input type="checkbox" name="contextPreviewPlatform" value="${platform}" /> ${escapeHtml(platform)}</label>`).join("")}
        </div>
      </div>

      <div class="form-banner form-banner--error" data-admin-context-preview-banner hidden></div>

      <button type="submit" class="btn btn--primary">Preview Context</button>
    </form>
  `;
}

function renderList(title, items) {
  if (items.length === 0) {
    return `<div class="admin-context-preview__section"><h3 class="admin-page__section-title">${escapeHtml(title)}</h3><p class="admin-empty">None found for this selection.</p></div>`;
  }
  return `
    <div class="admin-context-preview__section">
      <h3 class="admin-page__section-title">${escapeHtml(title)}</h3>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>
  `;
}

// Exported so app.js's submit handler can render the response without
// duplicating this markup — the same "page owns its own render
// function" shape as every other admin form/result page.
export function renderContextPreviewResult(context) {
  const product = context.product;
  const audience = context.audience;
  const pillar = context.pillar;
  const voice = context.brandVoice;

  return `
    <div class="admin-context-preview__section">
      <h3 class="admin-page__section-title">Product Facts</h3>
      ${
        product
          ? `<p>${escapeHtml(product.name)} (${escapeHtml(product.status)}). ${formatCurrency(product.price)}, ${product.stockQuantity} in stock. ${product.images.length} real image${product.images.length === 1 ? "" : "s"}.</p>`
          : `<p class="admin-empty">No product selected.</p>`
      }
    </div>
    <div class="admin-context-preview__section">
      <h3 class="admin-page__section-title">Audience</h3>
      ${audience ? `<p>${escapeHtml(audience.name)}${audience.description ? `: ${escapeHtml(audience.description)}` : ""}</p>` : `<p class="admin-empty">No audience selected.</p>`}
    </div>
    <div class="admin-context-preview__section">
      <h3 class="admin-page__section-title">Content Pillar</h3>
      ${pillar ? `<p>${escapeHtml(pillar.name)}${pillar.description ? `: ${escapeHtml(pillar.description)}` : ""}</p>` : `<p class="admin-empty">No content pillar selected.</p>`}
    </div>
    ${renderList("Writing Rules", voice.writingRules)}
    ${renderList("Visual Rules", voice.visualRules)}
    ${renderList("Approved Claims", voice.approvedClaims)}
    ${renderList("Prohibited Claims", voice.prohibitedClaims)}
    ${renderList("Calls to Action", voice.callToActionRules)}
    ${renderList("Platform Rules", voice.platformRules)}
  `;
}

export async function renderAdminContentContextPreview() {
  try {
    const [productsResponse, pillarsResponse, audiencesResponse] = await Promise.all([
      getAdminProducts({ limit: 100 }),
      getAdminContentPillars({ isActive: true }),
      getAdminAudiences({ isActive: true }),
    ]);

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("context-preview")}
        <h2 class="admin-page__section-title">AI Context Preview</h2>
        <p class="admin-page__subtitle">
          See exactly what a future AI request would receive for a given product, audience and content pillar.
          This is a preview only. It never generates content and never spends anything.
        </p>
        ${renderForm(productsResponse.data.products, pillarsResponse.data, audiencesResponse.data)}
        <div data-admin-context-preview-results></div>
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
