// Per-page SEO helpers (Version 6, Milestone 48): document.title, the
// <meta name="description"> tag, one optional page-specific
// structured-data (JSON-LD) block, and (Version 7, Milestone 99) the
// <link rel="canonical"> tag.
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

// Version 7, Milestone 99: the real production domain, deliberately
// hardcoded rather than built from window.location.origin — a
// canonical tag should always declare the site's one real URL
// regardless of which host actually served this particular request
// (a local dev/preview server while testing, a future staging
// deployment, etc.), matching index.html's own static canonical and
// the sitemap generator's SITE_URL (scripts/generate-static-routes.mjs).
const SITE_URL = "https://www.seasonedzgroup.co.za";

function getOrCreateDescriptionTag() {
  let tag = document.querySelector('meta[name="description"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", "description");
    document.head.appendChild(tag);
  }
  return tag;
}

function getOrCreateRobotsTag() {
  let tag = document.querySelector('meta[name="robots"]');
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", "robots");
    document.head.appendChild(tag);
  }
  return tag;
}

function getOrCreateCanonicalTag() {
  let tag = document.querySelector('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }
  return tag;
}

// Every route's canonical is its own URL — window.location.pathname
// (not .href/.search) already excludes any query string, e.g.
// "/shop?sort=newest" resolves to just "/shop" here, exactly matching
// the requirement that sort/filter/search query strings never appear
// in a canonical URL. A trailing slash is added for every path except
// the root itself: GitHub Pages redirects a bare generated route like
// /shop to /shop/ (see router.js's own comment on this), so /shop/ is
// the final, redirect-free URL a canonical tag should point at — and
// matches the trailing-slash URLs scripts/generate-static-routes.mjs
// now lists in sitemap.xml. Applied to every route, including
// noindex/private ones (cart, checkout, admin, ...): a self-
// referencing canonical is harmless on a noindex page (Google won't
// index it either way) and is far simpler and safer than trying to
// selectively omit the tag per route, which would risk a stale
// canonical left over from whatever page the visitor looked at
// previously — the exact staleness bug setPageMeta's own robots-tag
// handling already exists to avoid.
function buildCanonicalUrl() {
  const path = window.location.pathname || "/";
  const withTrailingSlash = path === "/" || path.endsWith("/") ? path : `${path}/`;
  return `${SITE_URL}${withTrailingSlash}`;
}

// Version 7, Milestone 88A: the robots tag is set explicitly on every
// navigation — "index, follow" by default, "noindex, nofollow" when
// the route asks for it — rather than only ever adding a noindex tag.
// Otherwise a private page's noindex would wrongly persist onto the
// next public page the visitor navigates to, the same staleness
// problem clearPageStructuredData() already exists to avoid for
// structured data.
export function setPageMeta({ title, description, noindex = false } = {}) {
  if (title) document.title = `${title} | Seasonedz Group`;
  getOrCreateDescriptionTag().setAttribute("content", description || DEFAULT_DESCRIPTION);
  getOrCreateRobotsTag().setAttribute("content", noindex ? "noindex, nofollow" : "index, follow");
  getOrCreateCanonicalTag().setAttribute("href", buildCanonicalUrl());
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
