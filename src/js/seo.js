// Per-page SEO helpers (Version 6, Milestone 48): document.title, the
// <meta name="description"> tag, and one optional page-specific
// structured-data (JSON-LD) block.
//
// router.js calls setPageMeta() with each route's default title/
// description on every navigation, so every page always has *some*
// accurate, non-stale value. A page whose content depends on async
// data (e.g. a specific product) can call setPageMeta() again, and/or
// setPageStructuredData(), once it knows more — overriding the
// router's generic default with something more specific.

// Kept identical to index.html's own static <meta name="description">
// tag, so the very first paint (before any JS runs) and every
// subsequent SPA navigation without a more specific description agree.
const DEFAULT_DESCRIPTION =
  "Educational colouring books, Bible colouring books, mindfulness colouring books, markers and crayons for parents, teachers, schools and churches.";

const STRUCTURED_DATA_ID = "page-structured-data";

function getOrCreateDescriptionTag() {
  let tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", "description");
    document.head.appendChild(tag);
  }
  return tag;
}

export function setPageMeta({ title, description } = {}) {
  if (title) document.title = `${title} | Seasonedz Group`;
  getOrCreateDescriptionTag().setAttribute("content", description || DEFAULT_DESCRIPTION);
}

// One JSON-LD block per page, replacing whatever the previous page set
// (never accumulating) — see clearPageStructuredData(), which
// router.js calls on every navigation before a page has a chance to
// set its own, so a page that doesn't call this never inherits stale
// structured data from whatever the customer viewed before it.
export function setPageStructuredData(data) {
  clearPageStructuredData();
  if (!data) return;
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.id = STRUCTURED_DATA_ID;
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

export function clearPageStructuredData() {
  document.getElementById(STRUCTURED_DATA_ID)?.remove();
}
