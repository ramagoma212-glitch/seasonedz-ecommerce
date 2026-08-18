// Wishlist page. Reads the live wishlist from Local Storage (via
// wishlist.js) on every render, so it reflects the current saved
// products, including right after a remove/clear action re-renders it
// in place (see rerenderCurrentRoute in js/app.js).

import { getWishlist } from "../js/wishlist.js";
import { renderWishlistItem } from "../components/wishlistItem.js";
import { renderEmptyState } from "../components/filterBar.js";
import { getCatalog } from "../js/api/productsApi.js";

// Version 7, Milestone 171E: wishlist entries carry only a snapshot
// from when they were saved (name/price/image — see js/wishlist.js's
// addToWishlist()), never live stock — so whether "Add to Cart" should
// be enabled for a saved item has to come from a fresh lookup against
// the real catalogue (the same one shop/homepage/product pages already
// use), never a second inventory system. Best-effort: a slow/failed
// fetch just means every item is treated as available on this
// particular render (Add to Cart itself, and the backend's own
// authoritative stock check at order-creation time, still protect the
// order regardless — see order.service.ts's verifyItems()) — it never
// blocks the wishlist page itself from rendering.
export async function renderWishlistPage() {
  const items = getWishlist();

  if (!items.length) {
    return `
      <section class="stub-page container">
        <h1 class="stub-page__title">Your Wishlist</h1>
        ${renderEmptyState({
          title: "Your wishlist is empty",
          message: "Save products you love to find them again easily.",
          actionHref: "/shop",
          actionLabel: "Browse Products",
        })}
      </section>
    `;
  }

  let liveProductsBySlug = new Map();
  try {
    const { products } = await getCatalog();
    liveProductsBySlug = new Map(products.map((product) => [product.slug, { stockStatus: product.stockStatus, productType: product.productType }]));
  } catch {
    liveProductsBySlug = new Map();
  }

  return `
    <section class="container wishlist-page">
      <div class="wishlist-page__header">
        <h1 class="stub-page__title">Your Wishlist</h1>
        <button type="button" class="list-clear-btn" data-action="clear-wishlist">Clear Wishlist</button>
      </div>

      <div class="grid grid--3">
        ${items
          .map((item, index) => {
            const live = liveProductsBySlug.get(item.slug);
            const outOfStock = live ? live.productType !== "DIGITAL" && live.stockStatus === "Out of Stock" : false;
            return renderWishlistItem(item, { eager: index < 3, outOfStock });
          })
          .join("")}
      </div>
    </section>
  `;
}
