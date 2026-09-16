// Milestone 185: Marketing Link Builder — generates UTM-tagged links
// to real Seasonedz pages for staff to paste into Facebook/Instagram/
// TikTok posts scheduled through Metricool. This is deliberately NOT a
// Metricool replacement, a social publishing tool, or a Metricool API
// integration — Metricool still does all scheduling/publishing; GA4
// still does all measurement (see js/analytics.js's trackPageView(),
// which already sends the full page_location, UTM parameters
// included, on every navigation — confirmed by this milestone's own
// audit, not changed here). This page only builds a URL string; see
// js/marketingLinks.js for the actual (stateless, no backend call)
// logic.

import { isBackendUnavailable, isUnauthenticated, redirectToAdminLogin, renderAdminConnectionError, renderAdminRedirecting } from "../js/adminGuard.js";
import { getCurrentAdmin } from "../js/api/adminAuthApi.js";
import { getCatalog } from "../js/api/productsApi.js";
import { blogPosts } from "../data/blogPosts.js";
import { renderAdminNav } from "../components/adminNav.js";
import { renderContentStudioSubNav } from "../components/contentStudioSubNav.js";
import { SOURCE_PRESETS, MEDIUM_PRESETS } from "../js/marketingLinks.js";
import { escapeHtml } from "../js/search.js";

function renderForm(products, categories) {
  return `
    <form class="admin-product-form" data-marketing-link-form novalidate>
      <div class="form-field">
        <label class="form-field__label" for="marketingLinkDestinationType">Destination</label>
        <select id="marketingLinkDestinationType" name="destinationType" class="form-field__input">
          <option value="home">Homepage</option>
          <option value="shop">Shop</option>
          <option value="product">Product</option>
          <option value="category">Category</option>
          <option value="blog">Blog Post</option>
          <option value="manual">Other Seasonedz URL</option>
        </select>
      </div>

      <div class="form-field" data-marketing-link-field="product" hidden>
        <label class="form-field__label" for="marketingLinkProduct">Product</label>
        <select id="marketingLinkProduct" name="productSlug" class="form-field__input">
          ${products.map((product) => `<option value="${escapeHtml(product.slug)}">${escapeHtml(product.name)}</option>`).join("")}
        </select>
      </div>

      <div class="form-field" data-marketing-link-field="category" hidden>
        <label class="form-field__label" for="marketingLinkCategory">Category</label>
        <select id="marketingLinkCategory" name="categorySlug" class="form-field__input">
          ${categories.map((category) => `<option value="${escapeHtml(category.slug)}">${escapeHtml(category.name)}</option>`).join("")}
        </select>
      </div>

      <div class="form-field" data-marketing-link-field="blog" hidden>
        <label class="form-field__label" for="marketingLinkBlog">Blog Post</label>
        <select id="marketingLinkBlog" name="blogSlug" class="form-field__input">
          ${blogPosts.map((post) => `<option value="${escapeHtml(post.slug)}">${escapeHtml(post.title)}</option>`).join("")}
        </select>
      </div>

      <div class="form-field" data-marketing-link-field="manual" hidden>
        <label class="form-field__label" for="marketingLinkManualUrl">Seasonedz page URL</label>
        <input type="text" id="marketingLinkManualUrl" name="manualUrl" class="form-field__input" placeholder="/shop or https://www.seasonedzgroup.co.za/shop" />
        <p class="admin-product-form__hint">Must be a real seasonedzgroup.co.za page — external domains are rejected.</p>
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="marketingLinkSource">Source</label>
          <select id="marketingLinkSource" name="source" class="form-field__input">
            ${SOURCE_PRESETS.map((preset) => `<option value="${preset}">${preset}</option>`).join("")}
            <option value="__custom__">Other (custom)</option>
          </select>
          <input type="text" id="marketingLinkSourceCustom" name="sourceCustom" class="form-field__input" placeholder="e.g. newsletter" hidden />
        </div>

        <div class="form-field">
          <label class="form-field__label" for="marketingLinkMedium">Medium</label>
          <select id="marketingLinkMedium" name="medium" class="form-field__input">
            ${MEDIUM_PRESETS.map((preset) => `<option value="${preset}">${preset}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="form-field">
        <label class="form-field__label" for="marketingLinkCampaign">Campaign <span class="form-field__required">(required)</span></label>
        <input type="text" id="marketingLinkCampaign" name="campaign" class="form-field__input" placeholder="revised_books_launch_2026" />
      </div>

      <div class="admin-product-form__row">
        <div class="form-field">
          <label class="form-field__label" for="marketingLinkContent">Content <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="marketingLinkContent" name="content" class="form-field__input" placeholder="abc_video_01" />
        </div>
        <div class="form-field">
          <label class="form-field__label" for="marketingLinkTerm">Term <span class="form-field__optional">(optional)</span></label>
          <input type="text" id="marketingLinkTerm" name="term" class="form-field__input" />
        </div>
      </div>

      <p class="form-banner form-banner--info" data-marketing-link-pii-note>
        Do not include customer names, email addresses, phone numbers, order numbers or other personal information in campaign tracking values.
      </p>

      <div class="form-banner form-banner--error" data-marketing-link-errors hidden></div>

      <div class="form-field">
        <label class="form-field__label" for="marketingLinkOutput">Generated link</label>
        <div class="admin-product-form__row">
          <input type="text" id="marketingLinkOutput" class="form-field__input" readonly value="" placeholder="Fill in the fields above to generate a link" />
          <button type="button" class="btn btn--secondary" data-action="copy-marketing-link" data-target="marketingLinkOutput" disabled>Copy Link</button>
        </div>
      </div>
    </form>
  `;
}

export async function renderAdminMarketingLinkBuilder() {
  try {
    await getCurrentAdmin();
    const { products, categories } = await getCatalog();

    return `
      <section class="container admin-page">
        ${renderAdminNav("content-studio")}
        <h1 class="admin-page__title">Content Studio</h1>
        ${renderContentStudioSubNav("marketing-links")}
        <h2 class="admin-page__section-title">Marketing Link Builder</h2>
        <p class="admin-page__subtitle">
          Generate a UTM-tagged link to a real Seasonedz page for a Facebook, Instagram or TikTok post scheduled
          through Metricool. Metricool still handles scheduling and publishing; GA4 measures what happens once
          someone clicks through. No URL shortener, no third-party tracking service.
        </p>
        ${renderForm(products, categories)}
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
