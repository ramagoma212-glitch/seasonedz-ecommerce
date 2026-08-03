// Shopping cart page. Reads the live cart from Local Storage (via
// cart.js) on every render, so it's always showing current state —
// including right after a quantity/remove/clear action re-renders it
// in place (see rerenderCurrentRoute in js/app.js).

import { getCartSummary } from "../js/cart.js";
import { renderCartItem } from "../components/cartItem.js";
import { renderOrderSummary } from "../components/orderSummary.js";
import { renderEmptyState } from "../components/filterBar.js";
import { renderCartCompositionNotice } from "../components/cartCompositionNotice.js";
import { getCurrentCustomer } from "../js/api/customerApi.js";

// Version 7, Milestone 131: best-effort only, same discipline as
// checkoutPage.js's own helper — being logged out (or the request
// failing) is never an error on the cart page, just the guest state.
async function isLoggedInRegisteredCustomer() {
  try {
    const response = await getCurrentCustomer();
    return response?.data?.customer?.type === "REGISTERED";
  } catch {
    return false;
  }
}

export async function renderCartPage() {
  const isRegisteredCustomer = await isLoggedInRegisteredCustomer();
  const { items, subtotal, giftWrapTotal, deliveryFee, composition } = getCartSummary(isRegisteredCustomer);

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

          ${items.map((item, index) => renderCartItem(item, { eager: index < 2 })).join("")}

          <a class="cart-page__continue" href="/shop">&larr; Continue Shopping</a>
        </div>

        ${renderOrderSummary({ subtotal, giftWrapTotal, deliveryFee, isRegisteredCustomer, hasPhysicalItems: composition.hasPhysical })}
      </div>
    </section>
  `;
}
