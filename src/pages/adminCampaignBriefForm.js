// Milestone 182, Part D/O: the Zeely Campaign Brief creation form.
// Controlled fields only — no free-text chat box, no "Generate" that
// calls a paid AI provider. Submitting calls POST .../campaign-briefs,
// which deterministically assembles the brief server-side
// (campaignBrief.service.ts) and redirects to the review page.

import { getAdminProducts } from "../js/api/adminDashboardApi.js";
import { getAdminAudiences, getAdminContentPillars } from "../js/api/contentStudioApi.js";
import { getAdminCampaignBrief } from "../js/api/campaignBriefApi.js";
import { ApiError } from "../js/apiClient.js";
import {
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderContentStudioSubNav } from "../components/contentStudioSubNav.js";
import { escapeHtml } from "../js/search.js";

const PLATFORM_OPTIONS = [
  { value: "FACEBOOK", label: "Facebook" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "X", label: "X" },
  { value: "LINKEDIN", label: "LinkedIn" },
  { value: "REDDIT", label: "Reddit" },
];

const GOAL_OPTIONS = [
  { value: "AWARENESS", label: "Awareness" },
  { value: "PREORDER", label: "Preorder" },
  { value: "PRODUCT_LAUNCH", label: "Product Launch" },
  { value: "SALES", label: "Sales" },
  { value: "EDUCATION", label: "Education" },
  { value: "ENGAGEMENT", label: "Engagement" },
  { value: "CUSTOMER_FEEDBACK", label: "Customer Feedback" },
  { value: "FAITH_BASED_EDUCATION", label: "Faith Based Education" },
  { value: "SCHOOL_OUTREACH", label: "School Outreach" },
  { value: "CHURCH_OUTREACH", label: "Church Outreach" },
  { value: "BULK_BUYING", label: "Bulk Buying" },
];

function productOptionLabel(product) {
  const preorderNote = product.preorderAdminStatus === "PREORDER_ACTIVE" ? " (Preorder Active)" : "";
  return `${product.name}, R${Number(product.price).toFixed(2)}${preorderNote}`;
}

function renderForm(products, audiences, pillars, brief = null) {
  return `
    <form
      class="admin-product-form"
      data-admin-campaign-brief-form
      data-mode="${brief ? "edit" : "create"}"
      ${brief ? `data-brief-id="${escapeHtml(brief.id)}"` : ""}
      novalidate
    >
      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="briefProduct">Product <span class="form-field__required">*</span></label>
          <select id="briefProduct" class="form-field__input" required>
            <option value="">Select a product</option>
            ${products.map((product) => `<option value="${escapeHtml(product.id)}"${brief?.product?.id === product.id ? " selected" : ""}>${escapeHtml(productOptionLabel(product))}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="briefAudience">Audience <span class="form-field__required">*</span></label>
          <select id="briefAudience" class="form-field__input" required>
            <option value="">Select an audience</option>
            ${audiences.map((audience) => `<option value="${escapeHtml(audience.id)}"${brief?.audience?.id === audience.id ? " selected" : ""}>${escapeHtml(audience.name)}</option>`).join("")}
          </select>
        </div>
        <div class="form-field">
          <label class="form-field__label" for="briefPillar">Content Pillar <span class="form-field__required">*</span></label>
          <select id="briefPillar" class="form-field__input" required>
            <option value="">Select a pillar</option>
            ${pillars.map((pillar) => `<option value="${escapeHtml(pillar.id)}"${brief?.pillar?.id === pillar.id ? " selected" : ""}>${escapeHtml(pillar.name)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="form-field">
        <span class="form-field__label">Platforms <span class="form-field__required">*</span></span>
        <div class="admin-product-form__checkboxes">
          ${PLATFORM_OPTIONS.map(
            (platform) =>
              `<label><input type="checkbox" name="briefPlatform" value="${platform.value}" ${brief?.platforms?.includes(platform.value) ? "checked" : ""} /> ${escapeHtml(platform.label)}</label>`
          ).join("")}
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="briefGoal">Campaign Goal <span class="form-field__required">*</span></label>
        <select id="briefGoal" class="form-field__input" required>
          <option value="">Select a goal</option>
          ${GOAL_OPTIONS.map((goal) => `<option value="${goal.value}"${brief?.goal === goal.value ? " selected" : ""}>${escapeHtml(goal.label)}</option>`).join("")}
        </select>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="briefCampaignType">Campaign Type <span class="form-field__optional">(optional, e.g. "Reel", "Carousel")</span></label>
          <input type="text" id="briefCampaignType" class="form-field__input" maxlength="100" value="${escapeHtml(brief?.campaignType || "")}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="briefContentQuantity">Content Quantity <span class="form-field__optional">(optional)</span></label>
          <input type="number" id="briefContentQuantity" class="form-field__input" min="1" step="1" value="${brief?.contentQuantity ?? ""}" />
        </div>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="briefStartDate">Campaign Start Date <span class="form-field__optional">(optional)</span></label>
          <input type="date" id="briefStartDate" class="form-field__input" value="${brief?.campaignStartAt ? brief.campaignStartAt.slice(0, 10) : ""}" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="briefEndDate">Campaign End Date <span class="form-field__optional">(optional)</span></label>
          <input type="date" id="briefEndDate" class="form-field__input" value="${brief?.campaignEndAt ? brief.campaignEndAt.slice(0, 10) : ""}" />
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="briefCallToAction">Call To Action <span class="form-field__optional">(optional)</span></label>
        <input type="text" id="briefCallToAction" class="form-field__input" maxlength="300" value="${escapeHtml(brief?.callToAction || "")}" />
      </div>

      <div class="form-field">
        <label class="form-field__label" for="briefAdditionalInstructions">Additional Instructions <span class="form-field__optional">(optional)</span></label>
        <textarea id="briefAdditionalInstructions" class="form-field__input form-field__textarea" rows="4" maxlength="2000">${escapeHtml(brief?.additionalInstructions || "")}</textarea>
      </div>

      <div class="form-banner form-banner--error" data-admin-campaign-brief-banner hidden></div>

      <button type="submit" class="btn btn--primary">${brief ? "Save and Regenerate Brief" : "Generate Brief"}</button>
    </form>
  `;
}

export { renderForm as renderCampaignBriefForm };

export async function renderAdminCampaignBriefCreate() {
  try {
    const [productsResponse, audiencesResponse, pillarsResponse] = await Promise.all([
      getAdminProducts({ limit: 100 }),
      getAdminAudiences({ isActive: true }),
      getAdminContentPillars({ isActive: true }),
    ]);

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("campaign-briefs")}
        <a class="admin-back-link" href="/admin/content-studio/campaign-briefs">&larr; Back to Campaign Briefs</a>
        <h2 class="admin-page__section-title">New Campaign Brief</h2>
        <p class="admin-page__subtitle">
          Choose a product, audience, content pillar and platforms, then generate a structured brief ready to paste
          into Zeely. This does not create any content itself.
        </p>
        ${renderForm(productsResponse.data.products, audiencesResponse.data, pillarsResponse.data)}
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

export async function renderAdminCampaignBriefEdit({ id } = {}) {
  if (!id) {
    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Campaign Brief Not Found</h1>
        <a class="btn btn--secondary" href="/admin/content-studio/campaign-briefs">Back to Campaign Briefs</a>
      </section>
    `;
  }

  try {
    const [productsResponse, audiencesResponse, pillarsResponse, briefResponse] = await Promise.all([
      getAdminProducts({ limit: 100 }),
      getAdminAudiences({ isActive: true }),
      getAdminContentPillars({ isActive: true }),
      getAdminCampaignBrief(id),
    ]);
    const brief = briefResponse.data;

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("campaign-briefs")}
        <a class="admin-back-link" href="/admin/content-studio/campaign-briefs/${encodeURIComponent(brief.id)}">&larr; Back to Campaign Brief</a>
        <h2 class="admin-page__section-title">Edit Campaign Brief</h2>
        <p class="admin-page__subtitle">
          Saving regenerates the brief text from current product data and stored brand knowledge.
        </p>
        ${renderForm(productsResponse.data.products, audiencesResponse.data, pillarsResponse.data, brief)}
      </section>
    `;
  } catch (error) {
    if (isUnauthenticated(error)) {
      redirectToAdminLogin();
      return renderAdminRedirecting();
    }
    if (error instanceof ApiError && error.status === 404) {
      return `
        <section class="container admin-page">
          ${renderAdminNav("content-studio")}
          <h1 class="admin-page__title">Campaign Brief Not Found</h1>
          <a class="btn btn--secondary" href="/admin/content-studio/campaign-briefs">Back to Campaign Briefs</a>
        </section>
      `;
    }
    return renderAdminConnectionError(isBackendUnavailable(error));
  }
}
