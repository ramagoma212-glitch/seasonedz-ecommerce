// Version 7, Milestone 144: renders Seasonedz Group's marketplace
// links (Takealot, Amazon.co.za, Amazon.com) in two places — a full
// homepage section and an optional compact product-page block — all
// built from the one shared list in data/marketplaceLinks.js.
//
// Real logo files (owner-supplied, not redrawn or altered) live at
// each marketplace's own `logo` path — used here on the homepage. The
// product page's block (renderProductMarketplaceBlock) deliberately
// stays text-only, to keep that area compact.
//
// Version 7, Milestone 167: the footer no longer repeats these links
// beside the copyright (see components/footer.js's own comment) —
// this file's footer-specific renderer was removed along with it,
// since marketplace links now live only in this one homepage section.

import { marketplaceLinks } from "../data/marketplaceLinks.js";
import { withBase } from "../js/paths.js";

// Version 7, Milestone 150: a marketplace with no verified url (e.g.
// Amazon.com, see data/marketplaceLinks.js's own comment) renders as
// plain, non-clickable content — never a placeholder/guessed href.
// Version 7, Milestone 167: adds a visible marketplace__label under
// the logo — Amazon.co.za and Amazon.com share the exact same logo
// image (no separate Amazon.com-specific asset exists), so without
// visible text a sighted customer had no way to tell the two Amazon
// cards apart.
function renderMarketplaceCard(marketplace) {
  const logo = `<img class="marketplace-card__logo" src="${withBase(marketplace.logo)}" alt="${marketplace.alt}" loading="lazy" decoding="async" />`;
  const label = `<span class="marketplace-card__label">${marketplace.displayLabel}</span>`;

  if (!marketplace.url) {
    return `
      <div class="card marketplace-card marketplace-card--unavailable" aria-label="${marketplace.name} (coming soon)">
        ${logo}
        ${label}
        <span class="marketplace-card__soon">Coming soon</span>
      </div>
    `;
  }

  return `
    <a
      class="card marketplace-card"
      href="${marketplace.url}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Shop Seasonedz Group on ${marketplace.name} (opens in a new tab)"
    >
      ${logo}
      ${label}
    </a>
  `;
}

export function renderMarketplaceHomeSection() {
  return `
    <section class="section container">
      <div class="marketplace-section">
        <div class="section__header">
          <h2>Also Available On</h2>
          <p>Find selected Seasonedz Group products on trusted online marketplaces.</p>
        </div>
        <div class="marketplace-section__cards">
          ${marketplaceLinks.map((marketplace) => renderMarketplaceCard(marketplace)).join("")}
        </div>
      </div>
    </section>
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
            ${
              marketplace.url
                ? `<a href="${marketplace.url}" target="_blank" rel="noopener noreferrer">${marketplace.name}</a>`
                : `<span aria-label="${marketplace.name} (coming soon)">${marketplace.name}</span>`
            }
          `
        )
        .join("")}
    </div>
  `;
}
