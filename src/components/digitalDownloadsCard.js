// Version 7, Milestone 152: shared "Digital Downloads" list — used by
// both the logged-in customer order-detail page (accountOrderDetail.js)
// and the guest secure-token download page (guestDownloadPage.js), so
// the two never drift apart in markup/behaviour. Every button here is
// wired up by a single delegated click handler in js/app.js
// (data-action="request-download") that calls the matching download
// API (customer or guest) and opens the freshly-generated, short-lived
// signed URL in a new tab — never a URL embedded directly in this
// markup.
import { escapeHtml } from "../js/search.js";

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function renderDownloadItem(item, { guestToken } = {}) {
  return `
    <div class="account-order-item digital-download-item">
      <div class="account-order-item__details">
        <p class="account-order-item__name">${escapeHtml(item.productName)}</p>
        <p class="account-order-item__meta">
          ${escapeHtml(item.displayName)} &middot; ${escapeHtml(item.fileType)} &middot; ${formatFileSize(item.fileSizeBytes)}
          ${item.pageCount ? ` &middot; ${Number(item.pageCount)} pages` : ""}
        </p>
      </div>
      <button
        type="button"
        class="btn btn--primary btn--sm"
        data-action="request-download"
        data-order-item-id="${escapeHtml(item.orderItemId)}"
        ${guestToken ? `data-guest-token="${escapeHtml(guestToken)}"` : ""}
      >Download</button>
    </div>
  `;
}

export function renderDigitalDownloadsCard(items, { guestToken } = {}) {
  if (!items || items.length === 0) return "";

  return `
    <div class="order-confirmation__card digital-downloads-card" data-digital-downloads-banner-host>
      <h3>Digital Downloads</h3>
      <div class="form-banner form-banner--error" data-digital-download-banner hidden></div>
      <div class="account-order-items">
        ${items.map((item) => renderDownloadItem(item, { guestToken })).join("")}
      </div>
      <p class="admin-product-form__hint">Download links are generated fresh each time and expire shortly after. This keeps your files secure.</p>
    </div>
  `;
}
