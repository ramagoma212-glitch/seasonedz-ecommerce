// Version 7, Milestone 167: one generic "show first 3, View More
// reveals the rest" grid, reusable by any homepage section with more
// than INITIAL_VISIBLE_COUNT real records — currently used by Digital
// Colouring Books (pages/home.js). Deliberately a separate
// implementation from Thoughtful Gifts' own existing View More (see
// js/app.js's handleToggleGiftViewMore) rather than a refactor of it —
// that one is already shipped, tested and explicitly not to be
// touched; this is the shared mechanism for anything built after it.
// Toggle behaviour lives in js/app.js (data-action="toggle-view-more"),
// the same delegated-click pattern every other homepage control uses.
export const INITIAL_VISIBLE_COUNT = 3;

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
