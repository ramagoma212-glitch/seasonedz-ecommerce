// Loading-state placeholders (Version 7, Milestone 92B). Milestone 92A
// found that the site's real CLS problem wasn't the images (every
// image class already had CSS-reserved space) — it was that pages
// depending on getCatalog() render completely empty until that async
// call resolves, then suddenly fill with a full grid of cards,
// shoving the footer down in one large jump.
//
// router.js shows one of these immediately (synchronously, before
// awaiting a route's Promise-returning render()) so the page's real
// vertical space is reserved from the first paint, then replaces it
// wholesale with the real content once the promise resolves — see
// router.js's renderCurrentRoute() and its SKELETON_RENDERERS map.
//
// Deliberately simple, static neutral blocks (no fake product names/
// prices/images) — aria-hidden="true" throughout, since a screen
// reader has nothing meaningful to announce about a placeholder shape
// and should simply wait for the real content that replaces it.

function skeletonCard() {
  return `
    <div class="card skeleton-card" aria-hidden="true">
      <div class="skeleton-block skeleton-card__image"></div>
      <div class="card__body">
        <div class="skeleton-block skeleton-card__line skeleton-card__line--title"></div>
        <div class="skeleton-block skeleton-card__line skeleton-card__line--subtitle"></div>
      </div>
    </div>
  `;
}

function skeletonCards(count) {
  return Array.from({ length: count }, skeletonCard).join("");
}

// Matches shop.js/searchResults.js's .product-grid — same class, so
// the grid's own responsive column count (2/3/4 depending on
// viewport, see css/responsive.css) sizes the skeleton identically to
// the real grid that replaces it.
export function renderProductGridSkeleton(count = 8) {
  return `<div class="product-grid">${skeletonCards(count)}</div>`;
}

// Matches categories.js/home.js's .grid.grid--3.
export function renderCategoryGridSkeleton(count = 6) {
  return `<div class="grid grid--3">${skeletonCards(count)}</div>`;
}

// A simpler skeleton for the product detail page: a square image
// placeholder beside a few text-line placeholders, loosely matching
// .product-details__layout's two-column shape without needing to
// replicate every field.
export function renderProductDetailSkeleton() {
  return `
    <section class="container product-details" aria-hidden="true">
      <div class="product-details__layout">
        <div class="skeleton-block skeleton-detail-image"></div>
        <div class="product-details__info">
          <div class="skeleton-block skeleton-detail-line skeleton-detail-line--meta"></div>
          <div class="skeleton-block skeleton-detail-line skeleton-detail-line--title"></div>
          <div class="skeleton-block skeleton-detail-line skeleton-detail-line--price"></div>
          <div class="skeleton-block skeleton-detail-line skeleton-detail-line--desc"></div>
        </div>
      </div>
    </section>
  `;
}

// Homepage mixes static markup (hero, welcome text) with async
// content (category grid, three product rails) in one atomic
// render() — reproducing every static section exactly isn't
// necessary to solve the actual problem (the footer being shoved
// down); reserving roughly the right amount of vertical space for
// the hero + category grid + one product row is enough to prevent
// the large jump without over-building this skeleton.
export function renderHomeSkeleton() {
  return `
    <section class="container">
      <div class="skeleton-block skeleton-hero" aria-hidden="true"></div>
    </section>
    <section class="section container" aria-hidden="true">
      <div class="skeleton-block skeleton-heading"></div>
      ${renderCategoryGridSkeleton(3)}
    </section>
    <section class="section container" aria-hidden="true">
      <div class="skeleton-block skeleton-heading"></div>
      ${renderProductGridSkeleton(4)}
    </section>
  `;
}
