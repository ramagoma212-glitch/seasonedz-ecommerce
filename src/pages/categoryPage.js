// Real, path-based category landing page (Version 7, Milestone 171I) —
// /category/:slug, e.g. /category/bible-colouring-books.
//
// Audit finding this exists to fix: every "category page" before this
// milestone was actually just /shop pre-filtered via a ?category=
// query string (see categories.js/categoryCard.js). shop.js already
// set a correct per-category title/H1/description when that filter was
// active — but js/seo.js's canonical tag is built from
// window.location.pathname alone (deliberately, so it never carries a
// sort/filter query string — see its own comment), which for a query-
// filtered "page" always collapsed back to plain "/shop". Google was
// effectively told "don't index this filtered view, index /shop
// instead" — undermining exactly the pages a search like "Bible
// colouring books" should have been able to rank on their own. A real
// path-based route fixes this for free: window.location.pathname is
// already /category/bible-colouring-books here, so the existing
// canonical logic in seo.js needs no changes at all.
//
// Deliberately a thin wrapper, not a rewrite — reuses renderShop()
// (and therefore its own existing filter bar, sorting, product grid,
// and per-category setPageMeta call) entirely, per the milestone
// brief's own "use the existing design system" / "do not create
// dozens of SEO-only pages" instructions. /shop?category=<slug> still
// works exactly as before for any existing link/bookmark that used it
// — this route is simply the new, stronger, primary one going forward.

import { renderShop } from "./shop.js";

export async function renderCategoryPage({ slug, query } = {}) {
  const mergedQuery = new URLSearchParams(query);
  mergedQuery.set("category", slug || "");
  return renderShop({ query: mergedQuery });
}
