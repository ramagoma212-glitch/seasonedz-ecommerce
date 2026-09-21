// Milestone 189, brief Part O: admin upload/activation of the three
// fixed welcome-gift sample PDFs. Same simplicity level as
// adminPreorderSettings.js — one page, one purpose. Any authenticated
// admin (STAFF or ADMIN) may upload — see adminWelcomeGift.routes.ts's
// own comment for why this stays unrestricted by role, matching the
// existing per-product digital-asset upload precedent.

import { getWelcomeGiftAssets } from "../js/api/adminWelcomeGiftApi.js";
import {
  consumePendingAdminMessage,
  isBackendUnavailable,
  isUnauthenticated,
  redirectToAdminLogin,
  renderAdminConnectionError,
  renderAdminRedirecting,
} from "../js/adminGuard.js";
import { renderAdminNav } from "../components/adminNav.js";
import { escapeHtml } from "../js/search.js";

function formatBytes(bytes) {
  if (!bytes) return "";
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function renderAssetCard(asset) {
  return `
    <div class="admin-product-form__section" data-welcome-gift-asset-card data-asset-key="${escapeHtml(asset.assetKey)}">
      <h2 class="admin-page__section-title">${escapeHtml(asset.displayName)}</h2>
      <p class="admin-product-form__hint">
        ${asset.isConfigured ? `Configured — ${formatBytes(asset.fileSizeBytes)}, ${asset.pageCount} page(s).` : "Not yet uploaded."}
      </p>
      <form class="admin-product-form" data-welcome-gift-asset-upload-form data-asset-key="${escapeHtml(asset.assetKey)}" novalidate>
        <div class="form-field">
          <label class="form-field__label" for="welcomeGiftFile-${escapeHtml(asset.assetKey)}">PDF file (must be exactly 4 pages)</label>
          <input type="file" id="welcomeGiftFile-${escapeHtml(asset.assetKey)}" accept="application/pdf" required />
        </div>
        <div class="form-banner form-banner--error" data-welcome-gift-asset-banner hidden></div>
        <button type="submit" class="btn btn--primary">${asset.isConfigured ? "Replace File" : "Upload File"}</button>
      </form>
    </div>
  `;
}

export async function renderAdminWelcomeGiftAssets() {
  try {
    const response = await getWelcomeGiftAssets();
    const assets = response.data.assets;
    const successMessage = consumePendingAdminMessage();
    const allConfigured = assets.every((asset) => asset.isConfigured);

    return `
      <section class="container admin-page">
        ${renderAdminNav("products")}
        <h1 class="admin-page__title">Welcome Gift Samples</h1>
        <p class="admin-page__subtitle">
          These three free 4-page PDF samples are sent once, automatically, to every new customer after they verify
          their email. The feature stays fully off (WELCOME_GIFT_ENABLED) until it's explicitly turned on in the
          backend environment, even after all three are uploaded here.
        </p>
        ${successMessage ? `<div class="form-banner form-banner--success">${escapeHtml(successMessage)}</div>` : ""}
        ${allConfigured ? `<div class="form-banner form-banner--success">All three samples are configured.</div>` : `<div class="form-banner form-banner--error">Not all three samples are configured yet — sends stay skipped until they are.</div>`}

        ${assets.map(renderAssetCard).join("")}
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
