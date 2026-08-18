// Shopping cart page. Reads the live cart from Local Storage (via
// cart.js) on every render, so it's always showing current state —
// including right after a quantity/remove/clear action re-renders it
// in place (see rerenderCurrentRoute in js/app.js).

import { getCartSummary, getUnavailableCartItems } from "../js/cart.js";
import { renderCartItem } from "../components/cartItem.js";
import { renderOrderSummary } from "../components/orderSummary.js";
import { renderEmptyState } from "../components/filterBar.js";
import { renderCartCompositionNotice } from "../components/cartCompositionNotice.js";
import { getCatalog } from "../js/api/productsApi.js";

// Version 7, Milestone 168C: the cart page used to show a
// representative delivery-fee estimate (Courier Guy Door to Door)
// before the customer had chosen a method.
// Version 7, Milestone 171F: removed entirely — live owner review of
// 171E found this estimate itself misleading (e.g. "Delivery R120"
// displayed on the cart page reads as an already-decided charge, even
// though the customer hasn't reached the delivery-method selector at
// checkout yet — see checkoutPage.js). getCartSummary() with no
// argument now gives deliveryFee: null for any cart with a physical
// item (see js/cart.js), and renderOrderSummary's own
// omitDeliveryUntilSelected option (below) removes the Delivery row
// from this page entirely rather than showing a "select a method"
// prompt — this page has no delivery-method selector to point at.
export async function renderCartPage() {
  const { items, subtotal, giftWrapTotal, deliveryFee, composition } = getCartSummary();

  if (!items.length) {
    return `
      <section class="stub-page container">
        <h1 class="stub-page__title">Your Cart</h1>
        ${renderEmptyState({
          title: "Your cart is empty",
          message: "Looks like you haven't added anything yet.",
          actionHref: "/shop",
          actionLabel: "Continue Shopping",
        })}
      </section>
    `;
  }

  // Version 7, Milestone 171E: cross-checks every cart line against
  // live product data (the same catalogue shop/homepage/product pages
  // already use) so a line that's sold out since it was added shows a
  // clear "Out of Stock" badge and blocks "Proceed to Checkout" — see
  // cart.js's getUnavailableCartItems(). Best-effort: a slow/failed
  // fetch just means staleness can't be detected on this page load, it
  // never blocks the cart page itself (the backend's own authoritative
  // check at order-creation time still protects the order regardless).
  let unavailableLineIds = new Set();
  let liveProductsBySlug = new Map();
  try {
    const { products } = await getCatalog();
    liveProductsBySlug = new Map(products.map((product) => [product.slug, { stockStatus: product.stockStatus, stockQuantity: product.stockQuantity, productType: product.productType }]));
    unavailableLineIds = new Set(getUnavailableCartItems(items, liveProductsBySlug).map((item) => item.lineId));
  } catch {
    unavailableLineIds = new Set();
  }

  return `
    <section class="container cart-page">
      <h1 class="stub-page__title">Your Cart</h1>
      ${renderCartCompositionNotice(composition)}

      <div class="cart-layout">
        <div class="cart-items">
          <div class="cart-items__header">
            <span>${items.length} item${items.length === 1 ? "" : "s"} in your cart</span>
            <button type="button" class="list-clear-btn" data-action="clear-cart">Clear Cart</button>
          </div>

          ${items
            .map((item, index) =>
              renderCartItem(item, {
                eager: index < 2,
                unavailable: unavailableLineIds.has(item.lineId),
                maxQuantity: liveProductsBySlug.get(item.slug)?.stockQuantity ?? Infinity,
              })
            )
            .join("")}

          <a class="cart-page__continue" href="/shop">&larr; Continue Shopping</a>
        </div>

        ${renderOrderSummary({ subtotal, giftWrapTotal, deliveryFee, hasPhysicalItems: composition.hasPhysical, checkoutBlocked: unavailableLineIds.size > 0, omitDeliveryUntilSelected: true })}
      </div>
    </section>
  `;
}
