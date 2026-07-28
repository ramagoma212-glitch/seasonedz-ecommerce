// Version 7, Milestone 144: renders Seasonedz Group's marketplace
// links (Takealot, Amazon.co.za) in three places — a full homepage
// section, a small footer line, and an optional compact product-page
// block — all built from the one shared list in
// data/marketplaceLinks.js.
//
// Real logo files (owner-supplied, not redrawn or altered) live at
// each marketplace's own `logo` path — used here on the homepage and
// footer. The product page's block (renderProductMarketplaceBlock)
// deliberately stays text-only, to keep that area compact.

import { marketplaceLinks } from "../data/marketplaceLinks.js";
import { withBase } from "../js/paths.js";

function renderMarketplaceCard(marketplace) {
  return `
    <a
      class="card marketplace-card"
      href="${marketplace.url}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Shop Seasonedz Group on ${marketplace.name} (opens in a new tab)"
    >
      <img class="marketplace-card__logo" src="${withBase(marketplace.logo)}" alt="${marketplace.alt}" loading="lazy" decoding="async" />
    </a>
  `;
}

export function renderMarketplaceHomeSection() {
  return `
    <section class="section container">
      <div class="marketplace-section">
        <div class="section__header">
          <h2>Also available on</h2>
          <p>You can also find selected Seasonedz Group products on trusted marketplaces.</p>
        </div>
        <div class="marketplace-section__cards">
          ${marketplaceLinks.map((marketplace) => renderMarketplaceCard(marketplace)).join("")}
        </div>
      </div>
    </section>
  `;
}

export function renderFooterMarketplaceLinks() {
  return `
    <p class="footer-marketplace">
      <span class="footer-marketplace__label">Shop Seasonedz Group on</span>
      ${marketplaceLinks
        .map(
          (marketplace) => `
            <a
              class="footer-marketplace__link"
              href="${marketplace.url}"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Shop Seasonedz Group on ${marketplace.name} (opens in a new tab)"
            >
              <img class="footer-marketplace__logo" src="${withBase(marketplace.logo)}" alt="${marketplace.alt}" loading="lazy" decoding="async" />
            </a>
          `
        )
        .join("")}
    </p>
  `;
}

export function renderProductMarketplaceBlock() {
  return `
    <div class="product-details__marketplace">
      <span class="product-details__marketplace-label">Also available on:</span>
      ${marketplaceLinks
        .map(
          (marketplace, index) => `
            ${index > 0 ? '<span class="footer-marketplace__divider" aria-hidden="true">&middot;</span>' : ""}
            <a href="${marketplace.url}" target="_blank" rel="noopener noreferrer">${marketplace.name}</a>
          `
        )
        .join("")}
    </div>
  `;
}
