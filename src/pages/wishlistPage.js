// Wishlist page. Reads the live wishlist from Local Storage (via
// wishlist.js) on every render, so it reflects the current saved
// products, including right after a remove/clear action re-renders it
// in place (see rerenderCurrentRoute in js/app.js).

import { getWishlist } from "../js/wishlist.js";
import { renderWishlistItem } from "../components/wishlistItem.js";
import { renderEmptyState } from "../components/filterBar.js";

export function renderWishlistPage() {
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

  return `
    <section class="container wishlist-page">
      <div class="wishlist-page__header">
        <h1 class="stub-page__title">Your Wishlist</h1>
        <button type="button" class="list-clear-btn" data-action="clear-wishlist">Clear Wishlist</button>
      </div>

      <div class="grid grid--3">
        ${items.map((item, index) => renderWishlistItem(item, { eager: index < 3 })).join("")}
      </div>
    </section>
  `;
}
