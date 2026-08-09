// Version 7, Milestone 167: one generic "show first N, View More
// reveals the rest" grid, reusable by any homepage section with more
// than initialVisibleCount real records — used by New Releases and
// Digital Colouring Books (pages/home.js), which both pass their own
// explicit initialVisibleCount and don't rely on this default.
// Deliberately a separate implementation from Thoughtful Gifts' own
// existing View More (see js/app.js's handleToggleGiftViewMore) rather
// than a refactor of it — that one is already shipped and tested; this
// is the shared mechanism for other sections. Toggle behaviour lives
// in js/app.js (data-action="toggle-view-more"), the same delegated-
// click pattern every other homepage control uses.
//
// Version 7, Milestone 171B.0: default lowered from 3 to 2 to match
// pages/home.js's own MOBILE_INITIAL_VISIBLE_COUNT — every current
// caller passes that explicitly, so this only matters as a safe
// fallback for a future caller that doesn't.
export const INITIAL_VISIBLE_COUNT = 2;

// `renderItem(item, index)` must return one grid-item's markup, whose
// root element carries the data-extra-card="true" attribute + `hidden`
// itself when `index >= initialVisibleCount` (renderExpandableGrid
// only decides WHICH items get that treatment, not how each item's own
// markup is built, so the same helper works for any card shape).
export function renderExpandableGrid({ items, renderItem, gridId, gridClass, scrollTargetId, initialVisibleCount = INITIAL_VISIBLE_COUNT }) {
  if (items.length === 0) return "";

  const hasMore = items.length > initialVisibleCount;
  const cards = items.map((item, index) => renderItem(item, index, { hiddenExtra: index >= initialVisibleCount })).join("");

  return `
    <div class="${gridClass}" id="${gridId}">
      ${cards}
    </div>
    ${
      hasMore
        ? `
      <div class="expandable-grid__view-more">
        <button
          type="button"
          class="btn btn--secondary"
          data-action="toggle-view-more"
          aria-expanded="false"
          aria-controls="${gridId}"
          ${scrollTargetId ? `data-scroll-target="${scrollTargetId}"` : ""}
        >View More</button>
      </div>
    `
        : ""
    }
  `;
}
